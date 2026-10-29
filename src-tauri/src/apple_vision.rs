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
    fn hologrip_apple_vision_is_running() -> bool;
    fn hologrip_apple_vision_start_async(
        context: *mut std::ffi::c_void,
        callback: extern "C" fn(*mut std::ffi::c_void, bool),
    );
    fn hologrip_apple_vision_stop() -> bool;
}

#[cfg(target_os = "ios")]
extern "C" fn on_apple_vision_started(context: *mut std::ffi::c_void, success: bool) {
    if context.is_null() {
        return;
    }
    let tx = unsafe { Box::from_raw(context as *mut tauri::async_runtime::Sender<bool>) };
    let _ = tx.try_send(success);
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
pub async fn apple_vision_start() -> bool {
    #[cfg(target_os = "ios")]
    {
        let (tx, mut rx) = tauri::async_runtime::channel::<bool>(1);
        let ctx = Box::into_raw(Box::new(tx)) as *mut std::ffi::c_void;
        unsafe {
            hologrip_apple_vision_start_async(ctx, on_apple_vision_started);
        }
        rx.recv().await.unwrap_or(false)
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
    #[cfg(target_os = "ios")]
    let running = unsafe { hologrip_apple_vision_is_running() };
    #[cfg(not(target_os = "ios"))]
    let running = false;

    AppleVisionStatus {
        supported,
        running,
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
