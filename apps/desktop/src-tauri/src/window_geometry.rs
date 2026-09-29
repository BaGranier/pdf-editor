use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

// All bounds below are physical pixels. Only UX targets are converted from
// logical pixels using the current monitor's scale factor.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Bounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn fitted_bounds(work: Bounds, requested: Bounds, margin: u32, center: bool) -> Bounds {
    let margin = margin
        .min(work.width.saturating_sub(1) / 2)
        .min(work.height.saturating_sub(1) / 2);
    let width = requested.width.min(work.width - 2 * margin).max(1);
    let height = requested.height.min(work.height - 2 * margin).max(1);
    let left = work.x + margin as i32;
    let top = work.y + margin as i32;
    Bounds {
        x: if center {
            work.x + ((work.width - width) / 2) as i32
        } else {
            requested
                .x
                .clamp(left, left + (work.width - 2 * margin - width) as i32)
        },
        y: if center {
            work.y + ((work.height - height) / 2) as i32
        } else {
            requested
                .y
                .clamp(top, top + (work.height - 2 * margin - height) as i32)
        },
        width,
        height,
    }
}

pub fn fit_window(window: &WebviewWindow, initial: bool) -> tauri::Result<()> {
    if window.is_fullscreen()? || window.is_maximized()? || window.is_minimized()? {
        return Ok(());
    }
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let position = window.outer_position()?;
    let frame_width = outer.width.saturating_sub(inner.width);
    let frame_height = outer.height.saturating_sub(inner.height);
    let requested = Bounds {
        x: position.x,
        y: position.y,
        width: if initial {
            (1280.0 * scale).round() as u32 + frame_width
        } else {
            outer.width
        },
        height: if initial {
            (820.0 * scale).round() as u32 + frame_height
        } else {
            outer.height
        },
    };
    let fitted = fitted_bounds(
        Bounds {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        },
        requested,
        (8.0 * scale).ceil() as u32,
        initial,
    );
    let client = PhysicalSize::new(
        fitted.width.saturating_sub(frame_width).max(1),
        fitted.height.saturating_sub(frame_height).max(1),
    );
    // A fixed logical minimum can exceed the entire work area at high DPI.
    window.set_min_size(Some(PhysicalSize::new(
        ((960.0 * scale).round() as u32).min(client.width),
        ((640.0 * scale).round() as u32).min(client.height),
    )))?;
    if inner != client {
        window.set_size(client)?;
    }
    let position = PhysicalPosition::new(fitted.x, fitted.y);
    if window.outer_position()? != position {
        window.set_position(position)?;
    }
    eprintln!("TAURI_WINDOW_GEOMETRY scale={scale} work={area:?} outer={fitted:?}");
    Ok(())
}

pub fn monitor_key(window: &WebviewWindow) -> Option<(i32, i32, u32, u32, u64)> {
    let monitor = window.current_monitor().ok().flatten()?;
    let area = monitor.work_area();
    Some((
        area.position.x,
        area.position.y,
        area.size.width,
        area.size.height,
        monitor.scale_factor().to_bits(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_target_and_frame_at_all_requested_resolutions_and_scales() {
        for (width, height) in [
            (1366, 768),
            (1920, 1080),
            (2560, 1440),
            (3840, 2160),
            (1080, 1920),
            (800, 600),
        ] {
            for scale in [1.0_f64, 1.25, 1.5, 1.75, 2.0] {
                let work = Bounds {
                    x: -3840,
                    y: -200,
                    width,
                    height: height - 48,
                };
                let target = Bounds {
                    x: 5000,
                    y: 5000,
                    width: (1296.0 * scale) as u32,
                    height: (859.0 * scale) as u32,
                };
                let fitted = fitted_bounds(work, target, (8.0 * scale) as u32, true);
                assert!(fitted.x >= work.x && fitted.y >= work.y);
                assert!(fitted.x + fitted.width as i32 <= work.x + work.width as i32);
                assert!(fitted.y + fitted.height as i32 <= work.y + work.height as i32);
            }
        }
    }

    #[test]
    fn clamps_disconnected_monitor_position_and_preserves_manual_size() {
        let work = Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1032,
        };
        let old = Bounds {
            x: -3000,
            y: 2000,
            width: 800,
            height: 700,
        };
        assert_eq!(
            fitted_bounds(work, old, 8, false),
            Bounds {
                x: 8,
                y: 324,
                width: 800,
                height: 700
            }
        );
        let visible = Bounds {
            x: 200,
            y: 100,
            width: 800,
            height: 700,
        };
        assert_eq!(fitted_bounds(work, visible, 8, false), visible);
    }
}
