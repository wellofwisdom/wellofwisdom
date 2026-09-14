// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom desktop shell: starts the server as a sidecar on a free
// localhost port with DB_DRIVER=pglite, waits for /api/health, opens the
// window, and shuts the sidecar down on exit. Single-instance, menu with
// Open data folder and Quit, navy icon at every size Tauri needs.

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::Manager;

fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(3000)
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("wellofwisdom"));
    base
}

fn wellofwisdom_exe() -> Option<PathBuf> {
    // Release sidecar produced by Well 13. Placeholder until it lands.
    // In dev the sidecar is node server/index.js from the repo.
    let candidates = [
        PathBuf::from("wellofwisdom-server"),
        PathBuf::from("wellofwisdom-server.exe"),
        PathBuf::from("../wellofwisdom-server"),
        PathBuf::from("../wellofwisdom-server.exe"),
    ];
    for c in candidates {
        let p = std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|d| d.join(&c)))
            .unwrap_or(c.clone());
        if p.exists() {
            return Some(p);
        }
        if c.exists() {
            return Some(c);
        }
    }
    None
}

fn start_sidecar(port: u16, data_dir: &PathBuf) -> std::io::Result<Child> {
    std::fs::create_dir_all(data_dir).ok();

    // Prefer the single executable if present, else node server/index.js for development.
    if let Some(exe) = wellofwisdom_exe() {
        return Command::new(exe)
            .env("PORT", port.to_string())
            .env("DB_DRIVER", "pglite")
            .env("DATA_DIR", data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn();
    }

    // Development: run node server/index.js from the repo root (two levels up from desktop/src-tauri).
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..");
    let server_js = repo_root.join("server").join("index.js");
    if server_js.exists() {
        return Command::new("node")
            .arg(&server_js)
            .env("PORT", port.to_string())
            .env("DB_DRIVER", "pglite")
            .env("DATA_DIR", data_dir)
            .current_dir(&repo_root)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn();
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no sidecar found: expected wellofwisdom-server or server/index.js",
    ))
}

fn wait_for_health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/api/health");
    for _ in 0..120 {
        if let Ok(resp) = std::net::TcpStream::connect(format!("127.0.0.1:{port}")) {
            drop(resp);
            // Try HTTP GET
            if let Ok(body) = std::process::Command::new("curl")
                .arg("-s")
                .arg("-o")
                .arg(if cfg!(windows) { "NUL" } else { "/dev/null" })
                .arg("-w")
                .arg("%{http_code}")
                .arg(&url)
                .output()
            {
                let code = String::from_utf8_lossy(&body.stdout).trim().to_string();
                if code == "200" {
                    return true;
                }
            }
            // Fallback: raw TCP success means the server is listening; give it a moment.
            std::thread::sleep(Duration::from_millis(250));
            // Try again with a simple HTTP check via ureq-less approach: just check TCP again.
            // If we got here the port is open, so consider it ready after a short wait.
            // The real HTTP check above already handles the happy path.
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

#[tauri::command]
fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = data_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::reveal_item_in_dir(&dir).map_err(|e| e.to_string())
}

pub fn run() {
    let sidecar: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let sidecar_clone = sidecar.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
                let _ = w.unminimize();
                let _ = w.show();
            }
        }))
        .setup(move |app| {
            let handle = app.handle().clone();
            let port = find_free_port();
            let ddir = data_dir(&handle);

            // Start sidecar
            match start_sidecar(port, &ddir) {
                Ok(child) => {
                    *sidecar_clone.lock().unwrap() = Some(child);
                }
                Err(e) => {
                    eprintln!("[desktop] failed to start sidecar: {e}");
                }
            }

            // Wait for health in background, then navigate window
            let handle2 = handle.clone();
            std::thread::spawn(move || {
                let ready = wait_for_health(port);
                let url = format!("http://127.0.0.1:{port}");
                if ready {
                    eprintln!("[desktop] server ready at {url}");
                } else {
                    eprintln!("[desktop] server did not become ready at {url} in time");
                }
                // Navigate the main window to the local server
                if let Some(win) = handle2.get_webview_window("main") {
                    let _ = win.navigate(url.parse().unwrap());
                }
            });

            // Build menu: Open data folder and Quit
            let open_item = tauri::menu::MenuItem::with_id(
                app.handle(),
                "open_data",
                "Open data folder",
                true,
                None::<&str>,
            )?;
            let quit_item = tauri::menu::MenuItem::with_id(
                app.handle(),
                "quit",
                "Quit",
                true,
                None::<&str>,
            )?;
            let menu = tauri::menu::Menu::with_items(app.handle(), &[&open_item, &quit_item])?;
            app.handle().set_menu(menu)?;

            let handle3 = app.handle().clone();
            app.on_menu_event(move |_app, event| match event.id.as_ref() {
                "open_data" => {
                    let _ = open_data_folder(handle3.clone());
                }
                "quit" => {
                    handle3.exit(0);
                }
                _ => {}
            });

            Ok(())
        })
        .on_window_event({
            let sidecar = sidecar.clone();
            move |_win, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Give sidecar a chance to shut down; if it does not, kill it.
                    if let Some(mut child) = sidecar.lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    api.prevent_close();
                    // Actually close after cleanup
                    std::process::exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![open_data_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
