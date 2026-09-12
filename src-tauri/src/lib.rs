pub mod compute;

use compute::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            simulate_nbody_step,
            simulate_wave_step
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
