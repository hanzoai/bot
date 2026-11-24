#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dock_icon;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            dock_icon::init(app.handle())?;

            let start_url = if std::env::var("HANZO_BOT_OFFLINE").ok().as_deref() == Some("1") {
                WebviewUrl::App("index.html".into())
            } else {
                let raw = std::env::var("HANZO_BOT_URL")
                    .unwrap_or_else(|_| "https://hanzo.bot".to_string());
                raw.parse::<tauri::Url>()
                    .map(WebviewUrl::External)
                    .unwrap_or_else(|_| WebviewUrl::App("index.html".into()))
            };

            #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
            let mut builder = WebviewWindowBuilder::new(app, "main", start_url)
                .title("Hanzo Bot")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .transparent(false)
                .center();

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }

            builder.build()?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            dock_icon::handle_menu_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            dock_icon::get_dock_icon_mode,
            dock_icon::set_dock_icon_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hanzo Bot native desktop application");
}
