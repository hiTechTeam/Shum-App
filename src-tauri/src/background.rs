//! Shum keeps running when its window closes, like other messengers: the
//! profile it serves keeps receiving messages and Bluetooth links. The menu
//! bar (tray) icon opens the window again or quits.
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

/// Brings the window back from hidden or minimized.
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть Shum", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти из Shum", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let builder = TrayIconBuilder::with_id("shum")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Shum")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "quit" => app.exit(0),
            _ => {}
        });
    // Windows and Linux open the window on a left click and keep the menu on
    // the right button; on macOS a click shows the menu, as menu bar icons do.
    #[cfg(not(target_os = "macos"))]
    let builder = builder
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show(tray.app_handle());
            }
        });
    builder.build(app)?;
    Ok(())
}
