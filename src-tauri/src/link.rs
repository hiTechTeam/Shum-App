//! The app's connection to the selected profile.
//!
//! A profile has one owner process on this device. When the CLI's service
//! already runs it, the app joins it. Otherwise the app serves the profile
//! itself through Shum-Core, and the CLI joins the app.
use serde_json::{json, Map, Value};
use shum_session::{service, Failure, Request};
use shum_store::profiles::Profiles;
use std::{path::PathBuf, time::Duration};
use tokio::{
    sync::{oneshot, Mutex},
    task::JoinHandle,
};

/// The `owner` this app reports in snapshots; the CLI never restarts it.
const OWNER: &str = "desktop";

struct Owned {
    stop: oneshot::Sender<()>,
    task: JoinHandle<anyhow::Result<()>>,
}

pub struct Link {
    root: PathBuf,
    owned: Mutex<Option<Owned>>,
}

fn failure(text: &str) -> Failure {
    Failure::text(text)
}

impl Link {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            owned: Mutex::new(None),
        }
    }

    /// The same data folder the CLI uses.
    pub fn default_root() -> Option<PathBuf> {
        directories::ProjectDirs::from("org", "Shum", "Shum")
            .map(|dirs| dirs.data_local_dir().to_path_buf())
    }

    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    pub fn profiles(&self) -> Result<Profiles, Failure> {
        Profiles::new(&self.root).map_err(|e| failure(&e.to_string()))
    }

    /// Makes another profile current. A session this app serves is closed
    /// first, so the next request opens the chosen profile.
    pub async fn switch(&self, id: &str) -> Result<(), Failure> {
        self.shutdown().await;
        self.profiles()?
            .select(id)
            .map_err(|e| failure(&e.to_string()))
    }

    fn selected(&self) -> Result<String, Failure> {
        let profiles = Profiles::new(&self.root).map_err(|e| failure(&e.to_string()))?;
        let (selected, list) = profiles.list().map_err(|e| failure(&e.to_string()))?;
        let usable = |id: &str| list.iter().any(|p| p.id == id && !p.deleting);
        selected
            .filter(|id| usable(id))
            .ok_or_else(|| failure("Профиля пока нет."))
    }

    /// Sends a request to the profile owner, opening the profile first when
    /// nobody owns it.
    pub async fn request(&self, request: Request) -> Result<Value, Failure> {
        let id = self.selected()?;
        match service::request(&self.root, &id, request.clone()).await {
            Ok(value) => return Ok(value),
            // A running owner may already have acted on the request: never resend.
            Err(error) if self.answers(&id).await => return Err(Failure::from_error(error)),
            Err(_) => {}
        }
        self.open(&id).await?;
        service::request(&self.root, &id, request)
            .await
            .map_err(Failure::from_error)
    }

    async fn answers(&self, id: &str) -> bool {
        service::request(&self.root, id, Request::Snapshot)
            .await
            .is_ok()
    }

    /// Serves the profile from the app unless another process already does.
    async fn open(&self, id: &str) -> Result<(), Failure> {
        let mut owned = self.owned.lock().await;
        if self.answers(id).await {
            return Ok(());
        }
        if service::is_locked(&self.root, id) {
            return Err(failure("Профиль заблокирован."));
        }
        if owned.as_ref().is_some_and(|o| o.task.is_finished()) {
            owned.take();
        }
        if owned.is_none() {
            let mut client = Map::new();
            client.insert("owner".into(), json!(OWNER));
            client.insert("version".into(), json!(env!("CARGO_PKG_VERSION")));
            let (stop, stopped) = oneshot::channel();
            let root = self.root.clone();
            let id = id.to_string();
            let task = tokio::spawn(async move {
                service::serve(&root, &id, client, async {
                    let _ = stopped.await;
                })
                .await
            });
            *owned = Some(Owned { stop, task });
        }
        // The first open may wait for the person to allow Keychain access.
        for _ in 0..600 {
            if self.answers(id).await {
                return Ok(());
            }
            if owned.as_ref().is_some_and(|o| o.task.is_finished()) {
                let finished = owned.take().expect("checked above");
                let result = finished.task.await;
                // Another process may have taken the profile meanwhile.
                if self.answers(id).await {
                    return Ok(());
                }
                return Err(match result {
                    Ok(Err(error)) => Failure::from_error(error),
                    _ => failure("Не удалось открыть профиль"),
                });
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        Err(failure("Профиль не открылся за 60 секунд"))
    }

    /// Closes profile `id` wherever it is open: the app's own session, or the
    /// service of another process, which is asked to stop.
    pub async fn close(&self, id: &str) -> Result<(), Failure> {
        self.shutdown().await;
        service::stop(&self.root, id)
            .await
            .map_err(Failure::from_error)
    }

    /// Stops the session this app serves so the database is checkpointed.
    pub async fn shutdown(&self) {
        if let Some(owned) = self.owned.lock().await.take() {
            let _ = owned.stop.send(());
            let _ = tokio::time::timeout(Duration::from_secs(5), owned.task).await;
        }
    }
}
