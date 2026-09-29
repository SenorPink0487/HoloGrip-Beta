//! 每个班级对应一个持久化白板。作为持有房间状态的单实例服务运行。
use crate::{auth::token::CurrentUser, error::AppError, profile::load_me, state::AppState};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;
#[path = "whiteboard_model.rs"]
mod model;
use model::{Active, Board, Command};

#[derive(Clone, Default)]
pub struct Hub(Arc<Mutex<HubState>>);
#[derive(Default)]
struct HubState {
    tickets: HashMap<String, (String, String, Instant)>,
    rooms: HashMap<String, Arc<Mutex<Room>>>,
}
struct Room {
    board: Board,
    active: Vec<Active>,
    tx: broadcast::Sender<Value>,
    replay: VecDeque<Value>,
    generation: String,
    clients: usize,
}
impl Room {
    fn new(board: Board) -> Self {
        Self {
            board,
            active: vec![],
            tx: broadcast::channel(1024).0,
            replay: VecDeque::new(),
            generation: Uuid::now_v7().to_string(),
            clients: 0,
        }
    }
    fn snapshot(&self) -> Value {
        let mut snapshot = self.board.snapshot(&self.active);
        snapshot["generation"] = json!(self.generation);
        snapshot
    }
    fn publish(&mut self, value: Value) {
        self.replay.push_back(value.clone());
        if self.replay.len() > 512 {
            self.replay.pop_front();
        }
        let _ = self.tx.send(value);
    }
}

pub async fn ticket(
    State(state): State<AppState>,
    Extension(hub): Extension<Hub>,
    user: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let class = load_me(&state.pool, &user.id)
        .await?
        .class
        .ok_or_else(|| AppError::forbidden("请先加入班级"))?;
    let mut hub = hub.0.lock().await;
    hub.tickets
        .retain(|_, (_, _, created)| created.elapsed() < Duration::from_secs(30));
    if hub.tickets.len() >= 10_000 {
        return Err(AppError::validation("连接请求过多，请稍后重试"));
    }
    let ticket = Uuid::now_v7().to_string();
    hub.tickets
        .insert(ticket.clone(), (user.id, class.id, Instant::now()));
    Ok(Json(json!({"ticket":ticket})))
}
#[derive(Deserialize)]
pub struct TicketQuery {
    ticket: String,
}
pub async fn upgrade(
    State(state): State<AppState>,
    Extension(hub): Extension<Hub>,
    Query(query): Query<TicketQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, AppError> {
    let (user, class, created) = hub
        .0
        .lock()
        .await
        .tickets
        .remove(&query.ticket)
        .ok_or_else(AppError::unauthorized)?;
    if created.elapsed() >= Duration::from_secs(30) {
        return Err(AppError::unauthorized());
    }
    if load_me(&state.pool, &user).await?.class.map(|c| c.id) != Some(class.clone()) {
        return Err(AppError::forbidden("班级已变更"));
    }
    let room = {
        let mut hub = hub.0.lock().await;
        if let Some(room) = hub.rooms.get(&class) {
            room.clone()
        } else {
            if hub.rooms.len() >= 2000 {
                return Err(AppError::validation("在线班级过多，请稍后重试"));
            }
            let saved: Option<(String,)> = sqlx::query_as(
                "SELECT CAST(snapshot AS CHAR) FROM class_whiteboards WHERE class_id = ?",
            )
            .bind(&class)
            .fetch_optional(&state.pool)
            .await?;
            let board = match saved {
                Some((s,)) => {
                    serde_json::from_str::<Board>(&s).map_err(|_| AppError::internal())?
                }
                None => Board::default(),
            };
            let room = Arc::new(Mutex::new(Room::new(board)));
            hub.rooms.insert(class.clone(), room.clone());
            room
        }
    };
    // 完整提交携带完整笔画以支持安全重试；增量消息保持小体积传输。
    Ok(ws
        .max_message_size(2 * 1024 * 1024)
        .max_frame_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| serve(socket, room, state, user, class, hub)))
}
async fn send(socket: &mut WebSocket, value: Value) -> bool {
    matches!(
        tokio::time::timeout(
            Duration::from_secs(5),
            socket.send(Message::Text(value.to_string().into()))
        )
        .await,
        Ok(Ok(()))
    )
}
async fn persist(
    state: &AppState,
    class: &str,
    board: &Board,
    cmd: &Command,
    user: &str,
) -> Result<(), AppError> {
    let mut tx = state.pool.begin().await?;
    let snapshot = serde_json::to_string(board).map_err(|_| AppError::internal())?;
    sqlx::query("INSERT INTO class_whiteboards (class_id, revision, snapshot) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE revision=VALUES(revision), snapshot=VALUES(snapshot)")
        .bind(class).bind(board.revision).bind(snapshot).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO whiteboard_operations (class_id, op_id, user_id) VALUES (?, ?, ?)")
        .bind(class)
        .bind(&cmd.op_id)
        .bind(user)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}
async fn serve(
    mut socket: WebSocket,
    room: Arc<Mutex<Room>>,
    state: AppState,
    user: String,
    class: String,
    hub: Hub,
) {
    let connection = Uuid::now_v7().to_string();
    let (mut rx, snapshot) = {
        let mut r = room.lock().await;
        r.clients += 1;
        (r.tx.subscribe(), r.snapshot())
    };
    let mut connected = send(&mut socket, snapshot).await;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    let mut last_seen = Instant::now();
    let mut rate_start = Instant::now();
    let mut rate = 0;
    while connected {
        tokio::select! {
            incoming=socket.recv()=>match incoming {
                Some(Ok(Message::Text(text)))=>{
                    last_seen=Instant::now();
                    if rate_start.elapsed()>=Duration::from_secs(1) { rate_start=Instant::now(); rate=0; }
                    rate+=1; if rate>240 { break; }
                    let Ok(value)=serde_json::from_str::<Value>(&text) else { break; };
                    if value["type"]=="sync" {
                        let r=room.lock().await;
                        rx=r.tx.subscribe();
                        let since=value["since"].as_u64().unwrap_or(u64::MAX);
                        let replay_ok=value["generation"]==r.generation && since<=r.board.revision && (since==r.board.revision || r.replay.front().and_then(|v|v["revision"].as_u64()).is_some_and(|first|first<=since+1));
                        let messages=if replay_ok { r.replay.iter().filter(|v|v["revision"].as_u64().unwrap_or(0)>since).cloned().collect::<Vec<_>>() } else { vec![r.snapshot()] };
                        drop(r);
                        for message in messages { if !send(&mut socket,message).await { connected=false; break; } }
                        continue;
                    }
                    let Ok(cmd)=serde_json::from_value::<Command>(value) else { break; };
                    if !model::valid_id(&cmd.op_id) || !model::valid_id(&cmd.page_id) { break; }
                    let mut r=room.lock().await;
                    let mut applied = r.board.applied.get(&cmd.op_id).cloned();
                    if applied.is_none() && cmd.durable() {
                        let receipt = sqlx::query_as::<_, (String,)>("SELECT user_id FROM whiteboard_operations WHERE class_id = ? AND op_id = ?")
                            .bind(&class).bind(&cmd.op_id).fetch_optional(&state.pool).await;
                        match receipt {
                            Ok(row) => applied = row.map(|(id,)| id),
                            Err(_) => {
                                drop(r);
                                send(&mut socket,json!({"type":"error","opId":cmd.op_id,"retry":true,"message":"保存服务暂时不可用，正在重新连接"})).await;
                                break;
                            }
                        }
                    }
                    if let Some(author)=applied {
                        let response=if author==user { json!({"type":"ack","opId":cmd.op_id}) } else { json!({"type":"error","opId":cmd.op_id,"message":"操作标识冲突"}) };
                        drop(r); connected=send(&mut socket,response).await; continue;
                    }
                    // 仅对持久化修改进行克隆。高频的点绘制热路径绝不复制画板。
                    let result=if cmd.durable() {
                        let mut next=r.board.clone(); let mut active=r.active.clone();
                        match next.apply(&mut active,&cmd,&user,&connection) {
                            Ok(message)=>match persist(&state,&class,&next,&cmd,&user).await {
                                Ok(())=>{r.board=next;r.active=active;Ok(message)},
                                Err(_)=>Err("保存失败，请稍后重新连接重试"),
                            },
                            Err(reason)=>Err(reason),
                        }
                    } else {
                        let Room {board,active,..}=&mut *r;
                        board.apply(active,&cmd,&user,&connection)
                    };
                    match result {
                        Ok(message)=>{
                            r.publish(message);
                            if cmd.durable() { let _=r.tx.send(json!({"type":"snapshot_updated","revision":r.board.revision})); }
                        }
                        Err(reason)=>{
                            let retry=reason.starts_with("保存失败");
                            let snapshot=r.snapshot(); rx=r.tx.subscribe(); drop(r);
                            connected=send(&mut socket,json!({"type":"error","opId":cmd.op_id,"retry":retry,"message":reason})).await;
                            if connected { connected=send(&mut socket,snapshot).await; }
                            if retry { break; }
                        }
                    }
                }
                Some(Ok(Message::Pong(_)))=>{last_seen=Instant::now();}
                Some(Ok(Message::Ping(payload)))=>{if socket.send(Message::Pong(payload)).await.is_err(){break;}}
                Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,
                _=>{}
            },
            outgoing=rx.recv()=>{
                let value=match outgoing {
                    Ok(v)=>v,
                    Err(broadcast::error::RecvError::Lagged(_))=>{let r=room.lock().await;rx=r.tx.subscribe();r.snapshot()},
                    Err(_)=>break,
                };
                connected=send(&mut socket,value).await;
            }
            _=heartbeat.tick()=>{
                if last_seen.elapsed()>Duration::from_secs(60) {break;}
                if !matches!(load_me(&state.pool,&user).await,Ok(me) if me.class.as_ref().map(|c|&c.id)==Some(&class)) {break;}
                if socket.send(Message::Ping(vec![].into())).await.is_err(){break;}
            }
        }
    }
    let _ = tokio::time::timeout(Duration::from_secs(1), socket.send(Message::Close(None))).await;
    // 未提交的预览数据为临时状态。书写端在重连后会重试发送完整笔画。
    // 保持 hub -> room 的加锁顺序，与 upgrade/eviction 保持一致。
    let mut h = hub.0.lock().await;
    let mut r = room.lock().await;
    let ids = r
        .active
        .iter()
        .filter(|s| s.connection == connection)
        .map(|s| s.stroke.id.clone())
        .collect::<Vec<_>>();
    r.active.retain(|s| s.connection != connection);
    if !ids.is_empty() {
        r.board.revision += 1;
        let revision = r.board.revision;
        r.publish(json!({"type":"strokes_cancelled","ids":ids,"revision":revision}));
    }
    r.clients -= 1;
    // 数据库已包含所有已确认的修改，因此空闲房间可被安全淘汰清理。
    if r.clients == 0 && Arc::strong_count(&room) <= 2 {
        h.rooms.remove(&class);
    }
}
