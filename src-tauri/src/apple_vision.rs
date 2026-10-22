use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppleVisionStatus {
    pub supported: bool,
    pub running: bool,
    pub backend: String,
}

#[cfg(target_os = "ios")]
extern "C" {
    fn hologrip_apple_vision_is_supported() -> bool;
    fn hologrip_apple_vision_start() -> bool;
    fn hologrip_apple_vision_stop() -> bool;
}

#[tauri::command]
pub fn apple_vision_is_supported() -> bool {
    #[cfg(target_os = "ios")]
    {
        unsafe { hologrip_apple_vision_is_supported() }
    }
    #[cfg(not(target_os = "ios"))]
    {
        false
    }
}

#[tauri::command]
pub fn apple_vision_start() -> bool {
    #[cfg(target_os = "ios")]
    {
        unsafe { hologrip_apple_vision_start() }
    }
    #[cfg(not(target_os = "ios"))]
    {
        false
    }
}

#[tauri::command]
pub fn apple_vision_stop() -> bool {
    #[cfg(target_os = "ios")]
    {
        unsafe { hologrip_apple_vision_stop() }
    }
    #[cfg(not(target_os = "ios"))]
    {
        false
    }
}

#[tauri::command]
pub fn apple_vision_get_status() -> AppleVisionStatus {
    let supported = apple_vision_is_supported();
    AppleVisionStatus {
        supported,
        running: false,
        backend: if supported {
            "Apple Vision Framework (ANE Native)".to_string()
        } else {
            "Web Worker MediaPipe".to_string()
        },
    }
}

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_apple_vision);

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("apple-vision")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                _api.register_ios_plugin(init_plugin_apple_vision)?;
            }
            Ok(())
        })
        .build()
}
