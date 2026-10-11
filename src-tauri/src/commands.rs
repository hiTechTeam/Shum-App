//! Commands the interface calls. Each one is a thin call into Shum-Core.
use crate::link::Link;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use shum_core::card::Card;
use shum_session::{Failure, Request};
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn failure(error: impl std::fmt::Display) -> Failure {
    Failure::text(error.to_string())
}

/// Avatar seeds are 64-bit; JavaScript numbers would round them.
fn quote_seeds(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, item) in map.iter_mut() {
                if key == "avatarSeed" && item.is_u64() {
                    *item = Value::String(item.to_string());
                } else {
                    quote_seeds(item);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(quote_seeds),
        _ => {}
    }
}

#[tauri::command]
pub async fn request(link: tauri::State<'_, Link>, request: Value) -> Result<Value, Failure> {
    let request: Request = serde_json::from_value(request).map_err(failure)?;
    let mut value = link.request(request).await?;
    quote_seeds(&mut value);
    Ok(value)
}

/// The v1 pixel avatar as 36x36 RGBA bytes.
#[tauri::command]
pub fn avatar(seed: String) -> Result<Vec<u8>, Failure> {
    let seed: u64 = seed.parse().map_err(failure)?;
    Ok(shum_core::avatar::render(seed)
        .pixels
        .into_iter()
        .flatten()
        .collect())
}

/// The 12x12 RGBA picture of a reaction.
#[tauri::command]
pub fn reaction(kind: shum_core::packet::ReactionKind) -> Vec<u8> {
    shum_core::reaction_art::pixels(kind)
        .into_iter()
        .flatten()
        .collect()
}

/// Which cells of the 3x3 "in chat" mark are lit for a contact.
#[tauri::command]
pub fn presence_pattern(seed: String) -> Vec<bool> {
    shum_core::presence::pattern(&seed).to_vec()
}

/// A new random avatar seed, as text for the same reason as `quote_seeds`.
#[tauri::command]
pub fn new_avatar_seed() -> Result<String, Failure> {
    Ok(u64::from_le_bytes(shum_session::random::<8>().map_err(failure)?).to_string())
}

#[tauri::command]
pub async fn set_avatar(link: tauri::State<'_, Link>, seed: String) -> Result<(), Failure> {
    let seed: u64 = seed.parse().map_err(failure)?;
    link.request(Request::Profile {
        name: None,
        bio: None,
        seed: Some(seed),
    })
    .await?;
    Ok(())
}

/// Local profiles and which one is open.
#[tauri::command]
pub fn profiles(link: tauri::State<'_, Link>) -> Result<Value, Failure> {
    let (selected, list) = link.profiles()?.list().map_err(failure)?;
    let list: Vec<_> = list.into_iter().filter(|p| !p.deleting).collect();
    Ok(json!({ "selected": selected, "profiles": list }))
}

#[tauri::command]
pub async fn switch_profile(link: tauri::State<'_, Link>, id: String) -> Result<(), Failure> {
    link.switch(&id).await
}

/// The link that adds this profile as a contact, and its QR code as SVG.
#[tauri::command]
pub async fn own_invitation(link: tauri::State<'_, Link>) -> Result<Value, Failure> {
    let snapshot = link.request(Request::Snapshot).await?;
    let card: Card = serde_json::from_value(snapshot["card"].clone()).map_err(failure)?;
    let text = card.invitation().map_err(failure)?;
    let qr = qrcode::QrCode::new(text.as_bytes())
        .map_err(failure)?
        .render::<qrcode::render::svg::Color<'_>>()
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build();
    Ok(json!({ "link": text, "qr": qr }))
}

/// RFC 3339 UTC with whole seconds, as protocol section 13 asks.
fn rfc3339(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3_600,
        rest % 3_600 / 60,
        rest % 60
    )
}

/// Seals the open profile and saves the file to Downloads without
/// replacing an existing file. Returns the saved path.
#[tauri::command]
pub async fn save_backup(
    link: tauri::State<'_, Link>,
    password: String,
) -> Result<String, Failure> {
    shum_store::backup::check_password(&password)
        .map_err(|_| failure("Пароль должен быть не короче 10 символов"))?;
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(failure)?
        .as_secs() as i64;
    let created_at = rfc3339(seconds);
    let reply = link
        .request(Request::Backup {
            password,
            created_at: created_at.clone(),
        })
        .await?;
    let file = STANDARD
        .decode(reply["file"].as_str().unwrap_or_default())
        .map_err(failure)?;
    let snapshot = link.request(Request::Snapshot).await?;
    let name: String = snapshot["card"]["name"]
        .as_str()
        .unwrap_or("profile")
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let folder = directories::UserDirs::new()
        .and_then(|dirs| dirs.download_dir().map(PathBuf::from))
        .ok_or_else(|| failure("Не найдена папка «Загрузки»"))?;
    let stem = format!("Shum-{name}-{}", &created_at[..10]);
    let ext = shum_store::backup::EXTENSION;
    for n in 0..100 {
        let path = if n == 0 {
            folder.join(format!("{stem}.{ext}"))
        } else {
            folder.join(format!("{stem}-{n}.{ext}"))
        };
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut out) => {
                use std::io::Write;
                out.write_all(&file).map_err(failure)?;
                out.sync_all().map_err(failure)?;
                return Ok(path.display().to_string());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(failure(error)),
        }
    }
    Err(failure("Файл уже существует, выберите другое имя"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn rfc3339_matches_known_dates() {
        assert_eq!(super::rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(super::rfc3339(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(super::rfc3339(1_791_670_000), "2026-10-10T22:06:40Z");
    }
}

fn blocking_failure(error: tokio::task::JoinError) -> Failure {
    failure(error)
}

/// Keys of the profile being created. As in every client, keys are made and
/// checked first; the name and avatar are asked after that. Only the latest preparation keeps its keys, so the avatar shown always
/// comes from the keys that will be used.
#[derive(Default)]
pub struct Prepared {
    keys: std::sync::Mutex<Option<shum_store::vault::ProfileKeys>>,
    latest: std::sync::atomic::AtomicU64,
}

/// Makes and checks keys for a new profile and returns the avatar seed the
/// profile starts with, which comes from its keys.
#[tauri::command]
pub async fn prepare_keys(
    link: tauri::State<'_, Link>,
    prepared: tauri::State<'_, Prepared>,
) -> Result<String, Failure> {
    use std::sync::atomic::Ordering;
    let attempt = prepared.latest.fetch_add(1, Ordering::SeqCst) + 1;
    let root = link.root().to_path_buf();
    let keys =
        tokio::task::spawn_blocking(move || shum_session::registration::prepare(&root, |_| {}))
            .await
            .map_err(blocking_failure)?
            .map_err(Failure::from_error)?;
    let seed = shum_session::registration::initial_seed(&keys).to_string();
    let mut slot = prepared.keys.lock().map_err(failure)?;
    if prepared.latest.load(Ordering::SeqCst) != attempt {
        return Err(failure("Ключи подготовлены повторно"));
    }
    *slot = Some(keys);
    Ok(seed)
}

/// Drops prepared keys when the person leaves the new profile flow.
#[tauri::command]
pub fn forget_keys(prepared: tauri::State<'_, Prepared>) {
    if let Ok(mut keys) = prepared.keys.lock() {
        keys.take();
    }
}

/// Creates the new profile from the prepared keys with the same checks as
/// the CLI and makes it current. Keys go to the system key store, like
/// every new profile.
#[tauri::command]
pub async fn create_profile(
    link: tauri::State<'_, Link>,
    prepared: tauri::State<'_, Prepared>,
    name: String,
    seed: String,
) -> Result<(), Failure> {
    use shum_session::registration;
    let seed: u64 = seed.parse().map_err(failure)?;
    let name = name.trim().to_string();
    registration::validate_name(&name).map_err(Failure::from_error)?;
    let keys = prepared
        .keys
        .lock()
        .map_err(failure)?
        .take()
        .ok_or_else(|| failure("Ключи не подготовлены, начните создание профиля заново"))?;
    link.shutdown().await;
    let root = link.root().to_path_buf();
    tokio::task::spawn_blocking(move || {
        registration::create(
            &root,
            &name,
            Some(seed),
            shum_store::vault::KeyMode::Auto,
            &registration::Settings::default(),
            keys,
        )
        .map(|_| ())
    })
    .await
    .map_err(blocking_failure)?
    .map_err(Failure::from_error)
}

/// Name and date of a backup file, shown before the password is asked.
#[tauri::command]
pub fn backup_summary(file: String) -> Result<Value, Failure> {
    let bytes = STANDARD.decode(file).map_err(failure)?;
    let summary = shum_store::backup::summary(&bytes)
        .map_err(|_| failure("Это не файл резервной копии Shum"))?;
    Ok(json!({ "profileName": summary.profile_name, "createdAt": summary.created_at }))
}

/// Restores a backup as a new profile on this computer and makes it current.
/// A profile with the same Shum ID is replaced only with `replace`.
#[tauri::command]
pub async fn restore_backup(
    link: tauri::State<'_, Link>,
    file: String,
    password: String,
    replace: bool,
) -> Result<(), Failure> {
    let bytes = STANDARD.decode(file).map_err(failure)?;
    link.shutdown().await;
    let profiles = link.profiles()?;
    tokio::task::spawn_blocking(move || {
        let restored = shum_store::backup::restore(
            &profiles,
            &bytes,
            &password,
            shum_store::vault::KeyMode::Auto,
            replace,
        )
        .map_err(|error| match error {
            shum_store::Error::Authentication
            | shum_store::Error::Core(shum_core::Error::Authentication) => {
                failure("Неверный пароль или файл повреждён")
            }
            shum_store::Error::ProfileExists => failure("Этот профиль уже есть на компьютере"),
            other => failure(other),
        })?;
        profiles.select(&restored.id).map_err(failure)
    })
    .await
    .map_err(blocking_failure)?
}

/// Deletes a local profile after the person typed its name. Keys, contacts
/// and messages are removed from this computer; another profile opens.
#[tauri::command]
pub async fn delete_profile(
    link: tauri::State<'_, Link>,
    id: String,
    confirm: String,
) -> Result<(), Failure> {
    let profiles = link.profiles()?;
    let (_, list) = profiles.list().map_err(failure)?;
    let profile = list
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| failure("Профиль не найден"))?;
    if confirm.trim() != profile.name {
        return Err(failure("Имя не совпало, удаление отменено"));
    }
    link.close(&id).await?;
    tokio::task::spawn_blocking(move || profiles.delete(&id).map_err(failure))
        .await
        .map_err(blocking_failure)?
}

/// Name and avatar of any local profile, without opening it in the app.
#[tauri::command]
pub async fn profile_preview(link: tauri::State<'_, Link>, id: String) -> Result<Value, Failure> {
    let mut preview = shum_session::service::preview(link.root(), &id)
        .await
        .unwrap_or(Value::Null);
    quote_seeds(&mut preview);
    Ok(preview)
}
