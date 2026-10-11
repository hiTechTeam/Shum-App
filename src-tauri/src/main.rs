//! Shum desktop: one window with the shared React interface. Message logic
//! runs in Shum-Core; this shell only passes requests to the profile owner.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod link;

use link::Link;

fn main() {
    let root = Link::default_root().expect("no home folder for Shum data");
    tauri::Builder::default()
        .manage(Link::new(root))
        .invoke_handler(tauri::generate_handler![
            commands::request,
            commands::avatar,
            commands::reaction,
            commands::new_avatar_seed,
            commands::set_avatar,
            commands::profiles,
            commands::switch_profile,
            commands::own_invitation,
            commands::save_backup,
        ])
        .build(tauri::generate_context!())
        .expect("Shum failed to start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                tauri::async_runtime::block_on(app.state::<Link>().shutdown());
            }
        });
}
