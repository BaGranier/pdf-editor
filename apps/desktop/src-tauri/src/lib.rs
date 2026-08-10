use serde::Serialize;
#[cfg(debug_assertions)]
use std::fs::File;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
#[cfg(debug_assertions)]
use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

const BACKEND_HOST: &str = "127.0.0.1";
#[cfg(not(debug_assertions))]
const BACKEND_SIDECAR_NAME: &str = "pdf-engine";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const HEALTH_RETRY_DELAY: Duration = Duration::from_millis(100);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    state: &'static str,
    base_url: Option<String>,
    log_path: String,
    message: Option<String>,
}

impl BackendStatus {
    fn starting(log_path: &Path) -> Self {
        Self {
            state: "starting",
            base_url: None,
            log_path: log_path.to_string_lossy().into_owned(),
            message: None,
        }
    }

    fn ready(base_url: String, log_path: &Path) -> Self {
        Self {
            state: "ready",
            base_url: Some(base_url),
            log_path: log_path.to_string_lossy().into_owned(),
            message: None,
        }
    }

    fn error(message: impl Into<String>, log_path: &Path) -> Self {
        Self {
            state: "error",
            base_url: None,
            log_path: log_path.to_string_lossy().into_owned(),
            message: Some(message.into()),
        }
    }
}

#[derive(Clone)]
struct BackendPaths {
    data: PathBuf,
    logs: PathBuf,
    temp: PathBuf,
    cache: PathBuf,
}

impl BackendPaths {
    fn create(&self) -> Result<(), String> {
        for path in [&self.data, &self.logs, &self.temp, &self.cache] {
            fs::create_dir_all(path).map_err(|error| {
                format!("Impossible de créer un répertoire applicatif: {error}")
            })?;
        }
        Ok(())
    }

    fn log_file(&self) -> PathBuf {
        self.logs.join("pdf-engine.log")
    }

    fn arguments(&self, port: u16) -> Vec<String> {
        vec![
            "--host".into(),
            BACKEND_HOST.into(),
            "--port".into(),
            port.to_string(),
            "--data-dir".into(),
            self.data.to_string_lossy().into_owned(),
            "--log-dir".into(),
            self.logs.to_string_lossy().into_owned(),
            "--temp-dir".into(),
            self.temp.to_string_lossy().into_owned(),
            "--cache-dir".into(),
            self.cache.to_string_lossy().into_owned(),
        ]
    }
}

enum ManagedBackendChild {
    #[cfg(not(debug_assertions))]
    Sidecar(CommandChild),
    #[cfg(debug_assertions)]
    Development(Child),
}

impl ManagedBackendChild {
    fn kill(self) {
        match self {
            #[cfg(not(debug_assertions))]
            Self::Sidecar(child) => {
                let _ = child.kill();
            }
            #[cfg(debug_assertions)]
            Self::Development(mut child) => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

struct BackendRuntime {
    child: Mutex<Option<ManagedBackendChild>>,
    status: Mutex<BackendStatus>,
    paths: BackendPaths,
}

impl BackendRuntime {
    fn new(paths: BackendPaths) -> Self {
        let log_path = paths.log_file();
        Self {
            child: Mutex::new(None),
            status: Mutex::new(BackendStatus::starting(&log_path)),
            paths,
        }
    }

    fn set_status(&self, status: BackendStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status;
        }
    }

    fn status(&self) -> BackendStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| {
                BackendStatus::error(
                    "L'état du moteur PDF local est indisponible.",
                    &self.paths.log_file(),
                )
            })
    }

    fn stop(&self) {
        if let Ok(mut child_slot) = self.child.lock() {
            if let Some(child) = child_slot.take() {
                child.kill();
            }
        }
        let _ = fs::remove_dir_all(&self.paths.temp);
    }
}

fn append_log(log_path: &Path, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{message}");
    }
}

fn choose_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| format!("Impossible de réserver un port local: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Impossible de lire le port local: {error}"))
}

fn health_is_ready(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("\"status\":\"ok\"")
}

fn wait_for_health(port: u16) -> bool {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if health_is_ready(port) {
            return true;
        }
        thread::sleep(HEALTH_RETRY_DELAY);
    }
    false
}

#[cfg(not(debug_assertions))]
fn spawn_sidecar(
    app: &AppHandle,
    arguments: &[String],
    log_path: &Path,
) -> Result<ManagedBackendChild, String> {
    let command = app
        .shell()
        .sidecar(BACKEND_SIDECAR_NAME)
        .map_err(|error| format!("Sidecar indisponible: {error}"))?
        .args(arguments);
    let (mut receiver, child) = command
        .spawn()
        .map_err(|error| format!("Impossible de lancer le sidecar: {error}"))?;
    let event_log_path = log_path.to_path_buf();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    append_log(&event_log_path, &String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Stderr(bytes) => {
                    append_log(&event_log_path, &String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Error(error) => append_log(&event_log_path, &error),
                CommandEvent::Terminated(payload) => append_log(
                    &event_log_path,
                    &format!("Backend sidecar terminated: {payload:?}"),
                ),
                _ => {}
            }
        }
    });
    Ok(ManagedBackendChild::Sidecar(child))
}

#[cfg(debug_assertions)]
fn spawn_development_backend(
    arguments: &[String],
    log_path: &Path,
) -> Result<ManagedBackendChild, String> {
    let backend_dir =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../services/pdf-engine");
    let stdout_log = File::options()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| format!("Impossible d'ouvrir le journal backend: {error}"))?;
    let stderr_log = stdout_log
        .try_clone()
        .map_err(|error| format!("Impossible de dupliquer le journal backend: {error}"))?;
    let child = StdCommand::new("uv")
        .arg("run")
        .arg("python")
        .arg("-m")
        .arg("app.desktop_server")
        .args(arguments)
        .current_dir(backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log))
        .spawn()
        .map_err(|error| {
            format!("Impossible de lancer le backend Python de développement: {error}")
        })?;
    Ok(ManagedBackendChild::Development(child))
}

fn launch_backend(_app: &AppHandle, runtime: &BackendRuntime) -> BackendStatus {
    let log_path = runtime.paths.log_file();
    if let Err(error) = runtime.paths.create() {
        return BackendStatus::error(error, &log_path);
    }
    append_log(&log_path, "Starting desktop PDF engine");

    let port = match choose_local_port() {
        Ok(port) => port,
        Err(error) => return BackendStatus::error(error, &log_path),
    };
    let arguments = runtime.paths.arguments(port);
    #[cfg(debug_assertions)]
    let child = spawn_development_backend(&arguments, &log_path);
    #[cfg(not(debug_assertions))]
    let child = spawn_sidecar(_app, &arguments, &log_path);

    let child = match child {
        Ok(child) => child,
        Err(error) => return BackendStatus::error(error, &log_path),
    };
    if let Ok(mut child_slot) = runtime.child.lock() {
        *child_slot = Some(child);
    } else {
        child.kill();
        return BackendStatus::error("Impossible de mémoriser le processus backend.", &log_path);
    }

    if wait_for_health(port) {
        BackendStatus::ready(format!("http://{BACKEND_HOST}:{port}"), &log_path)
    } else {
        runtime.stop();
        append_log(&log_path, "Backend health check timed out");
        BackendStatus::error(
            "Impossible de démarrer le moteur PDF local dans le délai prévu.",
            &log_path,
        )
    }
}

fn backend_paths(app: &AppHandle) -> Result<BackendPaths, String> {
    let resolver = app.path();
    let data = resolver
        .app_local_data_dir()
        .map_err(|error| format!("Répertoire de données indisponible: {error}"))?;
    let logs = resolver
        .app_log_dir()
        .map_err(|error| format!("Répertoire de logs indisponible: {error}"))?;
    let cache = resolver
        .app_cache_dir()
        .map_err(|error| format!("Répertoire de cache indisponible: {error}"))?;
    let temp = resolver
        .temp_dir()
        .map_err(|error| format!("Répertoire temporaire indisponible: {error}"))?
        .join("com.local.pdfstudio")
        .join(format!("backend-{}", std::process::id()));
    Ok(BackendPaths {
        data,
        logs,
        temp,
        cache,
    })
}

#[tauri::command]
fn get_backend_status(runtime: State<'_, BackendRuntime>) -> BackendStatus {
    runtime.status()
}

#[tauri::command]
async fn restart_backend(app: AppHandle) -> BackendStatus {
    let fallback_log_path = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| PathBuf::new())
        .join("pdf-engine.log");
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = app.state::<BackendRuntime>();
        runtime.stop();
        runtime.set_status(BackendStatus::starting(&runtime.paths.log_file()));
        let status = launch_backend(&app, &runtime);
        runtime.set_status(status.clone());
        status
    })
    .await
    .unwrap_or_else(|error| {
        BackendStatus::error(
            format!("La relance du moteur PDF local a échoué: {error}"),
            &fallback_log_path,
        )
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_status,
            restart_backend
        ])
        .on_page_load(|webview, payload| {
            eprintln!(
                "TAURI_WEBVIEW_URL label={} event={:?} url={}",
                webview.label(),
                payload.event(),
                payload.url()
            );
        })
        .setup(|app| {
            let paths = backend_paths(app.handle()).map_err(std::io::Error::other)?;
            app.manage(BackendRuntime::new(paths));
            #[cfg(debug_assertions)]
            if std::env::var_os("PDF_STUDIO_OPEN_DEVTOOLS").is_some() {
                if let Some(main_window) = app.get_webview_window("main") {
                    main_window.open_devtools();
                }
            }
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let runtime = app_handle.state::<BackendRuntime>();
                let status = launch_backend(&app_handle, &runtime);
                runtime.set_status(status);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PDF Studio Local");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            app_handle.state::<BackendRuntime>().stop();
        }
    });
}
