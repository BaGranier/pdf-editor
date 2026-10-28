use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Source checks/dev use tauri.conf.json and need no generated package files.
    // Release uses tauri.package.conf.json and a real health-checked sidecar.
    let target = env::var("TARGET").expect("Cargo TARGET is required");
    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar = PathBuf::from("binaries").join(format!("pdf-engine-{target}{extension}"));
    if env::var("PROFILE").as_deref() == Ok("release")
        && fs::metadata(&sidecar)
            .map(|metadata| metadata.len())
            .unwrap_or(0)
            == 0
    {
        panic!("release build requires a real backend sidecar; run npm run desktop:build");
    }
    tauri_build::build()
}
