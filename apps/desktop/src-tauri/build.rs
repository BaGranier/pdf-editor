use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Tauri validates externalBin even for `cargo check` and `tauri dev`.
    // Development launches the Python source directly, so provide a generated,
    // non-executable placeholder only to satisfy Tauri's debug validation. The
    // placeholder is never spawned. Release builds must receive the real,
    // health-checked PyInstaller sidecar from the build script.
    let target = env::var("TARGET").expect("Cargo TARGET is required");
    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar = PathBuf::from("binaries").join(format!("pdf-engine-{target}{extension}"));
    if env::var("PROFILE").as_deref() != Ok("release") {
        if !sidecar.exists() {
            fs::write(&sidecar, []).expect("failed to create the debug sidecar placeholder");
        }
    } else if fs::metadata(&sidecar)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
        == 0
    {
        panic!("release build requires a real backend sidecar; run npm run desktop:build");
    }
    tauri_build::build()
}
