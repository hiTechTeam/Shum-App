//! Shum desktop: one window with the shared React interface. Message logic
//! runs in Shum-Core; this shell only passes requests to the profile owner.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod background;
mod commands;
mod link;
mod updates;

use link::Link;

/// A messenger must keep receiving with its window in the background: without
/// this macOS App Nap slows the app's timers until Bluetooth links time out.
/// The computer itself may still sleep.
#[cfg(target_os = "macos")]
fn stay_awake() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let reason = NSString::from_str("Shum receives messages and keeps Bluetooth links");
    let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
        NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
        &reason,
    );
    // The activity lasts as long as the app runs.
    std::mem::forget(activity);
}

fn main() {
    #[cfg(target_os = "macos")]
    stay_awake();
    let root = Link::default_root().expect("no home folder for Shum data");
    tauri::Builder::default()
        .manage(Link::new(root))
        .manage(commands::Prepared::default())
        .manage(updates::Pending::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            background::tray(app.handle())?;
            updates::start(app.handle().clone());
            Ok(())
        })
        // Closing the window hides it; the profile keeps receiving messages.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::request,
            commands::avatar,
            commands::reaction,
            commands::sticker_set,
            commands::sticker_sets,
            commands::presence_pattern,
            commands::new_avatar_seed,
            commands::set_avatar,
            commands::profiles,
            commands::switch_profile,
            commands::own_invitation,
            commands::save_backup,
            commands::prepare_keys,
            commands::forget_keys,
            commands::create_profile,
            commands::backup_summary,
            commands::restore_backup,
            commands::delete_profile,
            commands::profile_preview,
            updates::update_ready,
            updates::install_update,
        ])
        .build(tauri::generate_context!())
        .expect("Shum failed to start")
        .run(|app, event| match event {
            // A click on the Dock icon brings the hidden window back.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => background::show(app),
            tauri::RunEvent::Exit => {
                use tauri::Manager;
                tauri::async_runtime::block_on(app.state::<Link>().shutdown());
            }
            _ => {}
        });
}
