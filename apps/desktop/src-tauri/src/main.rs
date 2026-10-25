// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_maximize,
            window_toggle_maximize,
            window_close,
            window_is_maximized,
            local_workspace_open_dialog,
            local_workspace_open_file_dialog,
            local_workspace_list,
            local_workspace_read_file,
            local_workspace_write_file,
            local_workspace_create_file,
            local_workspace_create_dir,
            local_workspace_delete,
            local_workspace_run_dev,
            keychain_get,
            keychain_set,
            keychain_delete,
            bot_check_gateway,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hanzo Bot desktop application");
}
