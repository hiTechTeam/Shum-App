//! Updates of the desktop app. Shum checks the latest GitHub release when it
//! starts and every six hours, downloads a newer version in the background,
//! and installs it when the person chooses to restart: on Windows the
//! installer closes the app, so it never runs unasked. Only updates signed
//! with Shum's update key are accepted.
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// A downloaded update waiting for a restart.
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let waiting = app.state::<Pending>().0.lock().unwrap().is_some();
            if !waiting {
                if let Err(error) = download(&app).await {
                    eprintln!("Shum update check failed: {error}");
                }
            }
            tokio::time::sleep(EVERY).await;
        }
    });
}

async fn download(app: &AppHandle) -> anyhow::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    let version = update.version.clone();
    *app.state::<Pending>().0.lock().unwrap() = Some((update, bytes));
    app.emit("update-ready", &version)?;
    Ok(())
}

/// The version downloaded and waiting for a restart, if any.
#[tauri::command]
pub fn update_ready(pending: State<'_, Pending>) -> Option<String> {
    pending.0.lock().unwrap().as_ref().map(|(update, _)| update.version.clone())
}

/// Installs the downloaded update and starts the new version.
#[tauri::command]
pub fn install_update(app: AppHandle, pending: State<'_, Pending>) -> Result<(), String> {
    let Some((update, bytes)) = pending.0.lock().unwrap().take() else {
        return Err("Обновление ещё не скачано".into());
    };
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart()
}
