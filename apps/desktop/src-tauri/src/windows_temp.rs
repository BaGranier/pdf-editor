//! Fail-closed cleanup: dead PID, old app directory, no junctions, exclusive lease.
use std::fs::{self, OpenOptions};
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::time::{Duration, SystemTime};
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_INVALID_PARAMETER};
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

fn process_may_exist(pid: u32) -> bool {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if !handle.is_null() {
        unsafe { CloseHandle(handle) };
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() != Some(ERROR_INVALID_PARAMETER as i32)
}

fn plain_tree(root: &Path) -> bool {
    let mut pending = vec![root.to_path_buf()];
    let mut inspected = 0;
    while let Some(path) = pending.pop() {
        inspected += 1;
        if inspected > 10000 {
            return false;
        }
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            return false;
        };
        if metadata.file_attributes() & 0x400 != 0 {
            return false;
        } // any reparse point
        if metadata.is_dir() {
            let Ok(entries) = fs::read_dir(path) else {
                return false;
            };
            for entry in entries {
                let Ok(entry) = entry else { return false };
                pending.push(entry.path());
            }
        }
    }
    true
}

pub fn cleanup(root: &Path) {
    cleanup_with(root, Duration::from_secs(24 * 60 * 60), process_may_exist);
}

fn cleanup_with(root: &Path, minimum_age: Duration, active: impl Fn(u32) -> bool) {
    let Ok(root) = root.canonicalize() else {
        return;
    };
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(pid) = name
            .strip_prefix("backend-")
            .and_then(|value| value.parse::<u32>().ok())
        else {
            continue;
        };
        if pid == 0 || pid == std::process::id() || active(pid) {
            continue;
        }
        let path = entry.path();
        let Ok(resolved) = path.canonicalize() else {
            continue;
        };
        if resolved.parent() != Some(root.as_path()) || !plain_tree(&path) {
            continue;
        }
        let Ok(age) = fs::metadata(&path)
            .and_then(|m| m.modified())
            .and_then(|t| {
                SystemTime::now()
                    .duration_since(t)
                    .map_err(std::io::Error::other)
            })
        else {
            continue;
        };
        if age < minimum_age {
            continue;
        }
        // Legacy folders without a lease cannot prove absence of an active sidecar.
        let lease_path = path.join(".backend-lease");
        let Ok(lease) = OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&lease_path)
        else {
            continue;
        };
        let Ok(contents) = fs::read_dir(&path) else {
            continue;
        };
        for child in contents.flatten() {
            if child.path() == lease_path {
                continue;
            }
            if child.file_type().is_ok_and(|kind| kind.is_dir()) {
                let _ = fs::remove_dir_all(child.path());
            } else {
                let _ = fs::remove_file(child.path());
            }
        }
        drop(lease);
        if !active(pid) {
            let _ = fs::remove_file(lease_path);
            let _ = fs::remove_dir(path); // only succeeds if empty
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_active_unrelated_and_legacy_directories() {
        let root =
            std::env::temp_dir().join(format!("pdfstudio-cleanup-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for name in ["backend-100", "backend-101", "backend-102", "unrelated"] {
            fs::create_dir_all(root.join(name)).unwrap();
        }
        for name in ["backend-100", "backend-101"] {
            fs::write(root.join(name).join(".backend-lease"), "lease").unwrap();
            fs::write(root.join(name).join("artifact"), "synthetic").unwrap();
        }
        cleanup_with(&root, Duration::ZERO, |pid| pid == 100);
        assert!(root.join("backend-100/artifact").exists());
        assert!(!root.join("backend-101").exists());
        assert!(root.join("backend-102").exists());
        assert!(root.join("unrelated").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn preserves_locked_and_recent_directories() {
        let root =
            std::env::temp_dir().join(format!("pdfstudio-lease-test-{}", std::process::id()));
        let folder = root.join("backend-103");
        fs::create_dir_all(&folder).unwrap();
        let lease_path = folder.join(".backend-lease");
        fs::write(&lease_path, "lease").unwrap();
        let lease = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&lease_path)
            .unwrap();
        cleanup_with(&root, Duration::ZERO, |_| false);
        assert!(folder.exists());
        drop(lease);
        cleanup_with(&root, Duration::from_secs(24 * 60 * 60), |_| false);
        assert!(folder.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
