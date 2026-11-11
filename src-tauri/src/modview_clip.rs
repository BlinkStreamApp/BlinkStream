use tauri::Webview;

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CornerCutout {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn validate_cutout(
    width: f64,
    height: f64,
    cutout: Option<CornerCutout>,
) -> Result<(), String> {
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err("Invalid moderation surface bounds".into());
    }
    if let Some(cutout) = cutout {
        if !cutout.x.is_finite()
            || !cutout.y.is_finite()
            || cutout.x < 0.0
            || cutout.y < 0.0
            || !cutout.width.is_finite()
            || !cutout.height.is_finite()
            || cutout.width <= 0.0
            || cutout.height <= 0.0
            || cutout.x + cutout.width > width
            || cutout.y + cutout.height > height
            || (cutout.width == width && cutout.height == height)
        {
            return Err("Invalid moderation corner".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub async fn apply(
    _view: &Webview,
    _width: f64,
    _height: f64,
    cutout: Option<CornerCutout>,
) -> Result<(), String> {
    if cutout.is_some() {
        Err("Corner layout is unavailable on this platform".into())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
pub async fn apply(
    view: &Webview,
    width: f64,
    height: f64,
    cutout: Option<CornerCutout>,
) -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "user32")]
    extern "system" {
        fn IsChild(parent: *mut c_void, child: *mut c_void) -> i32;
        fn SetWindowRgn(window: *mut c_void, region: *mut c_void, redraw: i32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> *mut c_void;
        fn CombineRgn(dest: *mut c_void, first: *mut c_void, second: *mut c_void, mode: i32)
            -> i32;
        fn DeleteObject(object: *mut c_void) -> i32;
    }
    validate_cutout(width, height, cutout)?;
    let window = view.window();
    let parent = window
        .hwnd()
        .map_err(|_| "Moderation window unavailable")?
        .0 as usize;
    let scale = window
        .scale_factor()
        .map_err(|_| "Moderation scale unavailable")?;
    let pixels = |value: f64| -> Result<i32, String> {
        let value = (value * scale).ceil();
        if !value.is_finite() || !(0.0..=32768.0).contains(&value) {
            return Err("Invalid moderation pixel bounds".into());
        }
        Ok(value as i32)
    };
    let full = (pixels(width)?, pixels(height)?);
    let corner = cutout
        .map(|c| {
            Ok::<_, String>((
                pixels(c.x)?,
                pixels(c.y)?,
                pixels(c.x + c.width)?,
                pixels(c.y + c.height)?,
            ))
        })
        .transpose()?;
    let (send, receive) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let result = (|| -> Result<(), String> {
            let mut container = Default::default();
            // The controller supplies its own WRY child container; never clip the app window.
            unsafe { platform.controller().ParentWindow(&mut container) }
                .map_err(|_| "Moderation container unavailable")?;
            let parent = parent as *mut c_void;
            if container.0.is_null()
                || container.0 == parent
                || unsafe { IsChild(parent, container.0) } == 0
            {
                return Err("Moderation container ownership mismatch".into());
            }
            // Region handles are local GDI allocations. Successful SetWindowRgn transfers ownership to Windows.
            unsafe {
                let Some((x, y, right, bottom)) = corner else {
                    return if SetWindowRgn(container.0, std::ptr::null_mut(), 1) != 0 {
                        Ok(())
                    } else {
                        Err("Could not clear moderation corner".into())
                    };
                };
                let region = CreateRectRgn(0, 0, full.0, full.1);
                let excluded = CreateRectRgn(x, y, right, bottom);
                if region.is_null() || excluded.is_null() {
                    if !region.is_null() {
                        DeleteObject(region);
                    }
                    if !excluded.is_null() {
                        DeleteObject(excluded);
                    }
                    return Err("Could not allocate moderation corner".into());
                }
                let combined = CombineRgn(region, region, excluded, 4);
                DeleteObject(excluded);
                if combined == 0 || SetWindowRgn(container.0, region, 1) == 0 {
                    DeleteObject(region);
                    return Err("Could not shape moderation corner".into());
                }
            }
            Ok(())
        })();
        let _ = send.send(result);
    })
    .map_err(|_| "Could not update moderation surface")?;
    receive
        .await
        .map_err(|_| "Moderation surface update interrupted")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_bounded_video_rectangles_are_accepted() {
        assert!(validate_cutout(
            1280.0,
            800.0,
            Some(CornerCutout {
                x: 80.0,
                y: 60.0,
                width: 800.0,
                height: 450.0
            })
        )
        .is_ok());
        assert!(validate_cutout(
            1280.0,
            800.0,
            Some(CornerCutout {
                x: 1200.0,
                y: 60.0,
                width: 100.0,
                height: 450.0
            })
        )
        .is_err());
        assert!(validate_cutout(
            1280.0,
            800.0,
            Some(CornerCutout {
                x: 0.0,
                y: 0.0,
                width: 448.0,
                height: 252.0
            })
        )
        .is_ok());
        for (width, height) in [
            (f64::NAN, 20.0),
            (20.0, f64::INFINITY),
            (-1.0, 20.0),
            (0.0, 20.0),
            (1281.0, 20.0),
            (20.0, 801.0),
        ] {
            assert!(validate_cutout(
                1280.0,
                800.0,
                Some(CornerCutout {
                    x: 0.0,
                    y: 0.0,
                    width,
                    height
                })
            )
            .is_err());
        }
        assert!(validate_cutout(1280.0, 800.0, None).is_ok());
    }
}
