use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

pub const MAX_POINTS: usize = 200_000;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub pressure: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stroke {
    pub id: String,
    pub tool: String,
    pub color: String,
    pub width: f64,
    pub opacity: f64,
    pub points: Vec<Point>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SavedStroke {
    #[serde(flatten)]
    pub stroke: Stroke,
    pub author: String,
    pub visible: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: String,
    pub epoch: u64,
    pub strokes: Vec<SavedStroke>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Active {
    pub page_id: String,
    pub epoch: u64,
    pub stroke: Stroke,
    #[serde(skip)]
    pub owner: String,
    #[serde(skip)]
    pub connection: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub op_id: String,
    pub page_id: String,
    #[serde(default)]
    pub epoch: u64,
    #[serde(flatten)]
    pub event: Event,
}
#[derive(Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    StrokeStart {
        stroke: Stroke,
    },
    StrokePoints {
        stroke_id: String,
        offset: usize,
        points: Vec<Point>,
    },
    StrokeCommit {
        stroke: Stroke,
    },
    CanvasClear,
    PageAdd,
    PageDelete,
    Undo,
    Redo,
}
impl Command {
    pub fn durable(&self) -> bool {
        !matches!(
            self.event,
            Event::StrokeStart { .. } | Event::StrokePoints { .. }
        )
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Action {
    user: String,
    page: String,
    epoch: u64,
    ids: Vec<String>,
    visible: bool,
    undone: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Board {
    pub pages: Vec<Page>,
    pub revision: u64,
    // 有界快速缓存；数据库中的操作记录表为权威的持久化去重依据。
    pub applied: HashMap<String, String>,
    history: Vec<Action>,
}
impl Default for Board {
    fn default() -> Self {
        Self {
            pages: vec![Page {
                id: "page-1".into(),
                epoch: 0,
                strokes: vec![],
            }],
            revision: 0,
            applied: HashMap::new(),
            history: vec![],
        }
    }
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.is_ascii()
}
fn valid_points(points: &[Point]) -> bool {
    !points.is_empty()
        && points.iter().all(|p| {
            p.x.is_finite()
                && p.y.is_finite()
                && (0.0..=1920.0).contains(&p.x)
                && (0.0..=1080.0).contains(&p.y)
                && p.pressure
                    .map_or(true, |v| v.is_finite() && (0.0..=1.0).contains(&v))
        })
}
fn valid_stroke(s: &Stroke) -> bool {
    valid_id(&s.id)
        && matches!(s.tool.as_str(), "pen" | "eraser")
        && s.color.starts_with('#')
        && matches!(s.color.len(), 4 | 7 | 9)
        && s.color[1..].chars().all(|c| c.is_ascii_hexdigit())
        && s.width.is_finite()
        && (0.1..=200.0).contains(&s.width)
        && s.opacity == 1.0
        && s.points.len() <= 16_000
        && valid_points(&s.points)
}
impl Board {
    pub fn snapshot(&self, active: &[Active]) -> Value {
        json!({"type":"snapshot", "revision":self.revision, "pages":self.pages, "active":active})
    }
    pub fn apply(
        &mut self,
        active: &mut Vec<Active>,
        cmd: &Command,
        user: &str,
        connection: &str,
    ) -> Result<Value, &'static str> {
        if !valid_id(&cmd.op_id) || !valid_id(&cmd.page_id) {
            return Err("无效的操作标识");
        }

        let page_idx = self.pages.iter().position(|p| p.id == cmd.page_id);
        if !matches!(cmd.event, Event::PageAdd) && page_idx.is_none() {
            return Err("页面已被删除");
        }
        if let Some(i) = page_idx {
            if self.pages[i].epoch != cmd.epoch {
                return Err("页面已被清屏，过期操作未提交");
            }
        }
        let total = if matches!(
            cmd.event,
            Event::StrokeStart { .. } | Event::StrokeCommit { .. }
        ) {
            self.pages
                .iter()
                .flat_map(|p| &p.strokes)
                .map(|s| s.stroke.points.len())
                .sum::<usize>()
        } else {
            0
        };
        let mut message = match &cmd.event {
            Event::StrokeStart { stroke } => {
                if !valid_stroke(stroke)
                    || total >= MAX_POINTS
                    || (active.len() >= 100
                        && !active
                            .iter()
                            .any(|s| s.stroke.id == stroke.id && s.owner == user))
                    || active.iter().any(|s| {
                        (s.connection == connection && s.stroke.id != stroke.id)
                            || (s.stroke.id == stroke.id && s.owner != user)
                    })
                    || self
                        .pages
                        .iter()
                        .flat_map(|p| &p.strokes)
                        .any(|s| s.stroke.id == stroke.id)
                {
                    return Err("无法开始笔迹，请重试或清理白板");
                }
                active.retain(|s| s.stroke.id != stroke.id);
                active.push(Active {
                    page_id: cmd.page_id.clone(),
                    epoch: cmd.epoch,
                    stroke: stroke.clone(),
                    owner: user.into(),
                    connection: connection.into(),
                });
                json!({"type":"stroke_start", "stroke":stroke})
            }
            Event::StrokePoints {
                stroke_id,
                offset,
                points,
            } => {
                if points.len() > 256 || !valid_points(points) {
                    return Err("笔迹数据无效");
                }
                let s = active
                    .iter_mut()
                    .find(|s| {
                        s.stroke.id == *stroke_id
                            && s.page_id == cmd.page_id
                            && s.owner == user
                            && s.connection == connection
                    })
                    .ok_or("笔迹已结束或被清除")?;
                if *offset != s.stroke.points.len() || offset + points.len() > 16_000 {
                    return Err("笔迹顺序不一致或单笔过长");
                }
                s.stroke.points.extend_from_slice(points);
                json!({"type":"stroke_points", "strokeId":stroke_id, "offset":offset, "points":points})
            }
            Event::StrokeCommit { stroke } => {
                if !valid_stroke(stroke) || total + stroke.points.len() > MAX_POINTS {
                    return Err("笔迹无效或白板容量已满");
                }
                if self
                    .pages
                    .iter()
                    .flat_map(|p| &p.strokes)
                    .any(|s| s.stroke.id == stroke.id)
                    || active
                        .iter()
                        .any(|s| s.stroke.id == stroke.id && s.owner != user)
                {
                    return Err("笔迹标识已被使用");
                }
                active.retain(|s| s.stroke.id != stroke.id);
                let saved = SavedStroke {
                    stroke: stroke.clone(),
                    author: user.into(),
                    visible: true,
                };
                self.pages[page_idx.unwrap()].strokes.push(saved.clone());
                self.record(user, cmd, vec![stroke.id.clone()], true);
                json!({"type":"stroke_commit", "stroke":saved})
            }
            Event::CanvasClear => {
                let page = &mut self.pages[page_idx.unwrap()];
                let ids = page
                    .strokes
                    .iter()
                    .filter(|s| s.visible)
                    .map(|s| s.stroke.id.clone())
                    .collect::<Vec<_>>();
                for s in &mut page.strokes {
                    s.visible = false;
                }
                page.epoch += 1;
                let epoch = page.epoch;
                active.retain(|s| s.page_id != cmd.page_id);
                self.history.retain(|h| h.page != cmd.page_id);
                let mut clear_cmd = cmd.clone();
                clear_cmd.epoch = epoch;
                self.record(user, &clear_cmd, ids, false);
                json!({"type":"canvas_clear", "epoch":epoch})
            }
            Event::PageAdd => {
                if page_idx.is_some() || self.pages.len() >= 100 {
                    return Err("页面已存在或页面数量已满");
                }
                let page = Page {
                    id: cmd.page_id.clone(),
                    epoch: 0,
                    strokes: vec![],
                };
                self.pages.push(page.clone());
                json!({"type":"page_add", "page":page})
            }
            Event::PageDelete => {
                if self.pages.len() == 1 {
                    return Err("至少保留一页白板");
                }
                self.pages.remove(page_idx.unwrap());
                active.retain(|s| s.page_id != cmd.page_id);
                self.history.retain(|h| h.page != cmd.page_id);
                json!({"type":"page_delete"})
            }
            Event::Undo | Event::Redo => {
                let redo = matches!(cmd.event, Event::Redo);
                let predicate = |h: &&Action| {
                    h.user == user
                        && h.page == cmd.page_id
                        && h.epoch == cmd.epoch
                        && h.undone == redo
                };
                let idx = if redo {
                    self.history
                        .iter()
                        .enumerate()
                        .find(|(_, h)| predicate(h))
                        .map(|(i, _)| i)
                } else {
                    self.history
                        .iter()
                        .enumerate()
                        .rev()
                        .find(|(_, h)| predicate(h))
                        .map(|(i, _)| i)
                }
                .ok_or("没有可撤销或重做的个人操作")?;
                let h = &mut self.history[idx];
                h.undone = !redo;
                let visible = if redo { h.visible } else { !h.visible };
                for s in &mut self.pages[page_idx.unwrap()].strokes {
                    if h.ids.contains(&s.stroke.id) {
                        s.visible = visible;
                    }
                }
                json!({"type":"strokes_visibility", "ids":h.ids, "visible":visible})
            }
        };
        self.revision += 1;
        message["revision"] = json!(self.revision);
        message["opId"] = json!(cmd.op_id);
        message["pageId"] = json!(cmd.page_id);
        if message.get("epoch").is_none() {
            message["epoch"] = json!(cmd.epoch);
        }
        if cmd.durable() {
            if self.applied.len() >= 1024 {
                if let Some(id) = self.applied.keys().next().cloned() {
                    self.applied.remove(&id);
                }
            }
            self.applied.insert(cmd.op_id.clone(), user.into());
        }
        Ok(message)
    }
    fn record(&mut self, user: &str, cmd: &Command, ids: Vec<String>, visible: bool) {
        self.history
            .retain(|h| !(h.user == user && h.page == cmd.page_id && h.undone));
        self.history.push(Action {
            user: user.into(),
            page: cmd.page_id.clone(),
            epoch: cmd.epoch,
            ids,
            visible,
            undone: false,
        });
        if self.history.len() > 1000 {
            self.history.remove(0);
        }
        // 当撤销/重做操作不再引用不可见的笔画时，将其丢弃清理。
        for page in &mut self.pages {
            page.strokes.retain(|s| {
                s.visible
                    || self
                        .history
                        .iter()
                        .any(|h| h.page == page.id && h.ids.contains(&s.stroke.id))
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn command(value: Value) -> Command {
        serde_json::from_value(value).unwrap()
    }
    fn stroke(id: &str) -> Value {
        json!({"id":id,"tool":"pen","color":"#000","width":4,"opacity":1,"points":[{"x":1,"y":2}]})
    }
    #[test]
    fn streaming_ownership_epoch_and_restart() {
        let mut b = Board::default();
        let mut a = vec![];
        let start = command(
            json!({"type":"stroke_start","pageId":"page-1","opId":"s","stroke":stroke("s1")}),
        );
        assert!(b.apply(&mut a, &start, "teacher", "c1").is_ok());
        let points = command(
            json!({"type":"stroke_points","pageId":"page-1","opId":"p","strokeId":"s1","offset":1,"points":[{"x":3,"y":4}]}),
        );
        assert!(b.apply(&mut a, &points, "student", "c2").is_err());
        assert!(b.apply(&mut a, &points, "teacher", "c1").is_ok());
        assert_eq!(a[0].stroke.points.len(), 2);
        assert!(b.pages[0].strokes.is_empty());
        let commit = command(
            json!({"type":"stroke_commit","pageId":"page-1","opId":"c","stroke":stroke("s1")}),
        );
        assert!(b.apply(&mut a, &commit, "teacher", "c1").is_ok());
        let restored: Board = serde_json::from_str(&serde_json::to_string(&b).unwrap()).unwrap();
        assert_eq!(restored.applied.get("c").unwrap(), "teacher");
        assert_eq!(restored.pages[0].strokes.len(), 1);
        let clear = command(json!({"type":"canvas_clear","pageId":"page-1","opId":"clear"}));
        b.apply(&mut a, &clear, "student", "c2").unwrap();
        assert!(b.apply(&mut a, &start, "teacher", "c1").is_err());
        assert!(a.is_empty());
    }
    #[test]
    fn personal_undo_preserves_others_and_clear_undo_preserves_new_ink() {
        let mut b = Board::default();
        let mut a = vec![];
        for (id, user) in [("s1", "teacher"), ("s2", "student")] {
            b.apply(
                &mut a,
                &command(
                    json!({"type":"stroke_commit","pageId":"page-1","opId":id,"stroke":stroke(id)}),
                ),
                user,
                "c",
            )
            .unwrap();
        }
        b.apply(
            &mut a,
            &command(json!({"type":"undo","pageId":"page-1","opId":"u"})),
            "teacher",
            "c",
        )
        .unwrap();
        assert!(!b.pages[0].strokes[0].visible);
        assert!(b.pages[0].strokes[1].visible);
        b.apply(
            &mut a,
            &command(json!({"type":"canvas_clear","pageId":"page-1","opId":"clear"})),
            "teacher",
            "c",
        )
        .unwrap();
        b.apply(&mut a,&command(json!({"type":"stroke_commit","pageId":"page-1","epoch":1,"opId":"new","stroke":stroke("s3")})),"student","c").unwrap();
        b.apply(
            &mut a,
            &command(json!({"type":"undo","pageId":"page-1","epoch":1,"opId":"undoClear"})),
            "teacher",
            "c",
        )
        .unwrap();
        assert!(b.pages[0].strokes.iter().all(|s| s.visible));
    }
}
