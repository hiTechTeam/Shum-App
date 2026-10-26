# Shum App

[English](README.md) · Русский

Shum для компьютера: чаты, контакты и люди рядом по Bluetooth. Превью 0.1.1 для macOS 15 и новее на Apple Silicon, Windows 10 и 11 (x64, ARM64). На Linux используйте [Shum CLI](https://github.com/hiTechTeam/Shum-CLI).

Интерфейс на React (`src`), оболочка на Tauri (`src-tauri`). Вся логика сообщений в [Shum-Core](https://github.com/hiTechTeam/Shum-Core), приложение её только показывает.

## Установка

Скачайте в [Releases](https://github.com/hiTechTeam/Shum-App/releases):

* **macOS:** `Shum-macOS.dmg`, перенесите Shum в «Программы». Он подписан самоподписанным сертификатом и не заверен Apple: при первом запуске откройте «Системные настройки» → «Конфиденциальность и безопасность» и нажмите «Всё равно открыть».
* **Windows:** `Shum-Windows-x64-setup.exe` или `-arm64-setup.exe`. Установщик не подписан: если Windows напишет, что защитила компьютер, нажмите «Подробнее» → «Выполнить в любом случае». Права администратора не нужны.

## Вместе с CLI

Приложение и [Shum CLI](https://github.com/hiTechTeam/Shum-CLI) видят одни и те же профили. Профиль на компьютере ведёт один процесс: если его уже открыла служба CLI, приложение подключается к ней, а если нет, приложение открывает профиль само, и тогда CLI подключается к приложению.

## Сборка

Нужны Node.js 20+ и Rust stable.

```sh
npm install
npm run tauri dev
```

Сборка для разработки не может пользоваться Bluetooth: macOS приписывает его терминалу. Всё, что открывает профиль, проверяйте на собранном приложении:

```sh
sh scripts/package_macos.sh    # DMG, универсальный
sh scripts/package_windows.sh  # установщики NSIS, сборка через cargo-xwin
```

## Лицензия

MIT
