use chrono::NaiveDateTime;
use sqlx::MySqlPool;

use crate::dto::{ClassView, MeResponse, StudentView};
use crate::error::AppError;

#[derive(sqlx::FromRow)]
struct UserRow {
    id: String,
    email: String,
    role: String,
    display_name: Option<String>,
}

#[derive(sqlx::FromRow)]
struct TeacherClassRow {
    id: String,
    name: String,
    invite_code: String,
}

#[derive(sqlx::FromRow)]
struct StudentClassRow {
    id: String,
    name: String,
}

#[derive(sqlx::FromRow)]
struct MemberRow {
    id: String,
    email: String,
    display_name: Option<String>,
    joined_at: NaiveDateTime,
}

pub async fn load_me(pool: &MySqlPool, user_id: &str) -> Result<MeResponse, AppError> {
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, role, display_name FROM users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(AppError::unauthorized)?;

    let class = if user.role == "teacher" {
        load_teacher_class(pool, &user.id).await?
    } else {
        load_student_class(pool, &user.id).await?
    };

    Ok(MeResponse {
        id: user.id,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
        class,
    })
}

async fn load_teacher_class(pool: &MySqlPool, teacher_id: &str) -> Result<Option<ClassView>, AppError> {
    let class = sqlx::query_as::<_, TeacherClassRow>(
        "SELECT id, name, invite_code FROM classes WHERE teacher_id = ?",
    )
    .bind(teacher_id)
    .fetch_optional(pool)
    .await?;

    let Some(class) = class else {
        return Ok(None);
    };

    let members = sqlx::query_as::<_, MemberRow>(
        "SELECT u.id, u.email, u.display_name, m.joined_at
         FROM class_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.class_id = ?
         ORDER BY m.joined_at ASC, u.email ASC",
    )
    .bind(&class.id)
    .fetch_all(pool)
    .await?;

    Ok(Some(ClassView {
        id: class.id,
        name: class.name,
        invite_code: Some(class.invite_code),
        students: Some(
            members
                .into_iter()
                .map(|member| StudentView {
                    id: member.id,
                    email: member.email,
                    display_name: member.display_name,
                    joined_at: format_time(member.joined_at),
                })
                .collect(),
        ),
    }))
}

async fn load_student_class(pool: &MySqlPool, user_id: &str) -> Result<Option<ClassView>, AppError> {
    let class = sqlx::query_as::<_, StudentClassRow>(
        "SELECT c.id, c.name
         FROM class_members m
         JOIN classes c ON c.id = m.class_id
         WHERE m.user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(class.map(|class| ClassView {
        id: class.id,
        name: class.name,
        invite_code: None,
        students: None,
    }))
}

fn format_time(value: NaiveDateTime) -> String {
    format!("{}Z", value.format("%Y-%m-%dT%H:%M:%S%.3f"))
}
