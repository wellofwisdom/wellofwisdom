// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom desktop shell: starts the server as a sidecar on a free
// localhost port with DB_DRIVER=pglite, waits for /api/health, opens the
// window, and shuts the sidecar down on exit. Single-instance, menu with
// Open data folder and Quit, navy icon at every size Tauri needs.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt as WinCommandExt;

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

fn apply_windows_creation_flags(cmd: &mut Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

fn start_sidecar(port: u16, data_dir: &PathBuf) -> std::io::Result<Child> {
    std::fs::create_dir_all(data_dir).ok();

    // Prefer the single executable if present, else node server/index.js for development.
    if let Some(exe) = wellofwisdom_exe() {
        let mut cmd = Command::new(exe);
        cmd.env("PORT", port.to_string());
        cmd.env("HOST", "127.0.0.1");
        cmd.env("DB_DRIVER", "pglite");
        cmd.env("DATA_DIR", data_dir);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::inherit());
        cmd.stderr(Stdio::inherit());
        apply_windows_creation_flags(&mut cmd);
        return cmd.spawn();
    }

    // Development: run node server/index.js from the repo root, only in debug.
    if cfg!(debug_assertions) {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..");
        let server_js = repo_root.join("server").join("index.js");
        if server_js.exists() {
            let mut cmd = Command::new("node");
            cmd.arg(&server_js);
            cmd.env("PORT", port.to_string());
            cmd.env("HOST", "127.0.0.1");
            cmd.env("DB_DRIVER", "pglite");
            cmd.env("DATA_DIR", data_dir);
            cmd.current_dir(&repo_root);
            cmd.stdin(Stdio::null());
            cmd.stdout(Stdio::inherit());
            cmd.stderr(Stdio::inherit());
            apply_windows_creation_flags(&mut cmd);
            return cmd.spawn();
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no sidecar found: expected wellofwisdom-server or server/index.js",
    ))
}

fn wait_for_health(port: u16) -> bool {
    // Plain HTTP/1.1 GET over TcpStream, no curl. Check for " 200 " in status line.
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{port}")) {
            let req = format!(
                "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(req.as_bytes()).is_ok() {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let mut buf = [0u8; 2048];
                if let Ok(n) = stream.read(&mut buf) {
                    let head = String::from_utf8_lossy(&buf[..n]);
                    let first_line = head.lines().next().unwrap_or("");
                    if first_line.contains(" 200 ") {
                        return true;
                    }
                }
            }
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

    let app = tauri::Builder::default()
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
        .build(tauri::generate_context!())
        .expect("error while building tauri app");

    app.run(move |_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(mut child) = sidecar.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
