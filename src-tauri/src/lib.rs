pub mod compute;
pub mod apple_vision;

use compute::*;
use apple_vision::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(apple_vision::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            simulate_nbody_step,
            simulate_wave_step,
            apple_vision_is_supported,
            apple_vision_start,
            apple_vision_stop,
            apple_vision_get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
