use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccountPreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spatial_window_scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub whiteboard_theme: Option<String>,
}

impl AccountPreferences {
    pub fn validate(&self) -> Result<(), AppError> {
        if let Some(theme) = self.whiteboard_theme.as_deref() {
            if !["plain", "grid", "chalkboard", "dark"].contains(&theme) {
                return Err(AppError::validation("白板背景无效"));
            }
        }
        if let Some(scale) = self.spatial_window_scale {
            if !scale.is_finite() || !(0.5..=2.0).contains(&scale) {
                return Err(AppError::validation("视窗缩放需要在 50% 到 200% 之间"));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_window_scale() {
        for scale in [0.5, 1.0, 1.37, 2.0] {
            assert!(AccountPreferences {
                spatial_window_scale: Some(scale),
                ..Default::default()
            }
            .validate()
            .is_ok());
        }
        for scale in [0.49, 2.01, f64::NAN, f64::INFINITY] {
            assert!(AccountPreferences {
                spatial_window_scale: Some(scale),
                ..Default::default()
            }
            .validate()
            .is_err());
        }
        assert!(AccountPreferences::default().validate().is_ok());
    }
}
