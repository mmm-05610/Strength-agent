use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarState {
    child: Mutex<Option<Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In dev mode, backend is in the parent project's mvp/backend
            let python_cmd: String;
            let backend_path: std::path::PathBuf;

            if cfg!(debug_assertions) {
                python_cmd = std::env::var("PYTHON_PATH")
                    .unwrap_or_else(|_| "python".to_string());
                // CWD is src-tauri/ when run via `cargo tauri dev`,
                // so we need two .parent() calls to reach the project root
                backend_path = std::env::current_dir()
                    .unwrap_or_default()
                    .parent()
                    .and_then(|p| p.parent())
                    .unwrap_or(std::path::Path::new("."))
                    .join("mvp")
                    .join("backend");
            } else {
                python_cmd = "python".to_string();
                backend_path = app
                    .path()
                    .resource_dir()
                    .unwrap_or_default()
                    .join("backend");
            }

            log::info!(
                "Starting FastAPI sidecar: {} -m uvicorn app.main:app --port 18720",
                python_cmd
            );
            log::info!("Backend path: {:?}", backend_path);

            // Kill any stale process holding port 18720 before starting
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("cmd")
                    .args([
                        "/c",
                        "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :18720 ^| findstr LISTENING') do taskkill /PID %a /F 2>nul",
                    ])
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("sh")
                    .args([
                        "-c",
                        "lsof -ti :18720 | xargs -r kill -9",
                    ])
                    .output();
            }
            // Brief wait for OS to release the port
            std::thread::sleep(std::time::Duration::from_millis(500));

            let child = Command::new(&python_cmd)
                .args([
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "18720",
                ])
                .current_dir(&backend_path)
                .spawn();

            match child {
                Ok(process) => {
                    log::info!("FastAPI sidecar started (PID: {})", process.id());
                    app.manage(SidecarState {
                        child: Mutex::new(Some(process)),
                    });
                }
                Err(e) => {
                    log::error!("Failed to start FastAPI sidecar: {}", e);
                    app.manage(SidecarState {
                        child: Mutex::new(None),
                    });
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(ref mut child) = *guard {
                            log::info!(
                                "Stopping FastAPI sidecar (PID: {})...",
                                child.id()
                            );
                            let _ = child.kill();
                            let _ = child.wait();
                            log::info!("FastAPI sidecar stopped");
                        }
                    }
                }
            }
        });
}
