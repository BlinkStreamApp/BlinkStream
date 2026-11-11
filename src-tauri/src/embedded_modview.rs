use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, Webview};

static HOST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static HOSTS: LazyLock<Mutex<HashMap<String, Host>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
struct Host {
    channel: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    zoom: Option<f64>,
}

fn remember_host(session: &str, host: Host) -> Result<(), String> {
    HOSTS
        .lock()
        .map_err(|_| "Moderation state unavailable")?
        .insert(session.to_owned(), host);
    Ok(())
}

fn host_snapshot(session: &str) -> Result<Host, String> {
    HOSTS
        .lock()
        .map_err(|_| "Moderation state unavailable")?
        .get(session)
        .cloned()
        .ok_or_else(|| "Moderation session unavailable".into())
}

fn child_view(app: &AppHandle, label: &str, host: &Host, visible: bool) -> Result<Webview, String> {
    let url = official_url(&host.channel)?;
    let zoom = zoom_factor(host.width, host.zoom)?;
    let navigation_app = app.clone();
    let navigation_label = label.to_owned();
    let builder = tauri::WebviewBuilder::new(label, tauri::WebviewUrl::External(url))
        .on_navigation(allowed_navigation)
        .on_new_window(move |url, _| {
            if allowed_navigation(&url) {
                let app = navigation_app.clone();
                let label = navigation_label.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(view) = app.get_webview(&label) {
                        let _ = view.navigate(url);
                    }
                });
            }
            tauri::webview::NewWindowResponse::Deny
        });
    let child = app
        .get_window("main")
        .ok_or("Main window unavailable")?
        .add_child(
            builder,
            tauri::LogicalPosition::new(host.x, host.y),
            tauri::LogicalSize::new(host.width, host.height),
        )
        .map_err(|_| "Could not open Twitch moderation")?;
    if child.set_zoom(zoom).is_err() {
        let _ = child.close();
        return Err("Could not scale Twitch moderation".into());
    }
    if !visible {
        child
            .hide()
            .map_err(|_| "Could not prepare moderation tools")?;
    }
    Ok(child)
}

fn host_label(session: &str) -> Result<String, String> {
    if session.len() != 32 || !session.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid moderation session".into());
    }
    Ok(format!("official_modview_{session}"))
}

fn detached_label(session: &str) -> Result<String, String> {
    host_label(session)?;
    Ok(format!("modview_tools_{session}"))
}

fn official_url(channel: &str) -> Result<tauri::Url, String> {
    crate::validate_channel(channel)?;
    format!(
        "https://www.twitch.tv/moderator/{}",
        channel.to_ascii_lowercase()
    )
    .parse()
    .map_err(|_| "Invalid moderation URL".into())
}

fn allowed_navigation(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host == "twitch.tv" || host.ends_with(".twitch.tv"))
}

fn zoom_factor(width: f64, requested: Option<f64>) -> Result<f64, String> {
    match requested {
        Some(value) if value.is_finite() && (0.65..=1.1).contains(&value) => Ok(value),
        Some(_) => Err("Invalid moderation zoom".into()),
        None => Ok((width / 1440.0).clamp(0.65, 1.0)),
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn mount_official_modview(
    app: AppHandle,
    webview: Webview,
    session: String,
    channel: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    zoom: Option<f64>,
) -> Result<bool, String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    official_url(&channel)?;
    crate::embedded_drops::check_bounds(&app, x, y, width, height)?;
    zoom_factor(width, zoom)?;
    let _guard = HOST_LOCK.lock().await;
    if app.get_webview(&label).is_some() {
        return Ok(cfg!(windows));
    }
    let host = Host {
        channel,
        x,
        y,
        width,
        height,
        zoom,
    };
    let child = child_view(&app, &label, &host, true)?;
    if let Err(error) = remember_host(&session, host) {
        let _ = child.close();
        return Err(error);
    }
    Ok(cfg!(windows))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_official_modview_bounds(
    app: AppHandle,
    webview: Webview,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
    zoom: Option<f64>,
    corner: Option<crate::modview_clip::CornerCutout>,
) -> Result<(), String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(window) = app.get_webview_window(&detached_label(&session)?) {
        let size = window
            .inner_size()
            .map_err(|_| "Could not measure moderation window")?;
        let scale = window
            .scale_factor()
            .map_err(|_| "Could not read moderation scale")?;
        return window
            .set_zoom(zoom_factor(f64::from(size.width) / scale, zoom)?)
            .map_err(|_| "Could not scale moderation window".into());
    }
    if let Some(view) = app.get_webview(&label) {
        if !visible {
            return view
                .hide()
                .map_err(|_| "Could not hide Twitch moderation".into());
        }
        crate::embedded_drops::check_bounds(&app, x, y, width, height)?;
        crate::modview_clip::validate_cutout(width, height, corner)?;
        let mut host = host_snapshot(&session)?;
        host.x = x;
        host.y = y;
        host.width = width;
        host.height = height;
        host.zoom = zoom;
        remember_host(&session, host)?;
        let zoom = zoom_factor(width, zoom)?;
        view.set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|_| "Could not position Twitch moderation")?;
        view.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|_| "Could not resize Twitch moderation")?;
        view.set_zoom(zoom)
            .map_err(|_| "Could not scale Twitch moderation")?;
        crate::modview_clip::apply(&view, width, height, corner).await?;
        view.show()
            .map_err(|_| "Could not show Twitch moderation")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_official_modview_detached(
    app: AppHandle,
    webview: Webview,
    session: String,
    detached: bool,
) -> Result<(), String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let floating_label = detached_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    let host = host_snapshot(&session)?;
    if !detached {
        if app.get_webview(&label).is_none() {
            child_view(&app, &label, &host, false)?;
        }
        if let Some(window) = app.get_webview_window(&floating_label) {
            window
                .destroy()
                .map_err(|_| "Could not close moderation window")?;
        }
        return Ok(());
    }
    if let Some(window) = app.get_webview_window(&floating_label) {
        window
            .show()
            .map_err(|_| "Could not show moderation window")?;
        return window
            .set_focus()
            .map_err(|_| "Could not focus moderation window".into());
    }
    let view = app
        .get_webview(&label)
        .ok_or("Moderation view unavailable")?;
    let url = official_url(&host.channel)?;
    let popup_app = app.clone();
    let popup_label = floating_label.clone();
    let parent = app.get_window("main").ok_or("Main window unavailable")?;
    let builder =
        tauri::WebviewWindowBuilder::new(&app, &floating_label, tauri::WebviewUrl::External(url))
            .background_color(tauri::utils::config::Color(14, 14, 16, 255))
            .title("Twitch · BlinkStream Mod View")
            .inner_size(1280.0, 800.0)
            .min_inner_size(800.0, 500.0)
            .resizable(true)
            .visible(false)
            .on_navigation(allowed_navigation)
            .on_new_window(move |url, _| {
                if allowed_navigation(&url) {
                    let app = popup_app.clone();
                    let label = popup_label.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(view) = app.get_webview(&label) {
                            let _ = view.navigate(url);
                        }
                    });
                }
                tauri::webview::NewWindowResponse::Deny
            });
    // Main can contain several child webviews, so get_webview_window("main") is not a valid owner lookup.
    #[cfg(windows)]
    let builder = builder.owner_raw(parent.hwnd().map_err(|_| "Moderation owner unavailable")?);
    #[cfg(target_os = "macos")]
    let builder = builder.parent_raw(
        parent
            .ns_window()
            .map_err(|_| "Moderation owner unavailable")?,
    );
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    let builder = builder.transient_for_raw(
        &parent
            .gtk_window()
            .map_err(|_| "Moderation owner unavailable")?,
    );
    let floating = builder
        .build()
        .map_err(|_| "Could not open moderation window")?;
    if view.close().is_err() {
        let _ = floating.destroy();
        return Err("Could not close embedded moderation".into());
    }
    let event_app = app.clone();
    let event_session = session.clone();
    floating.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = event_app.emit_to("main", "bs:official-modview-dock", &event_session);
        }
    });
    let result = floating
        .set_zoom(zoom_factor(1280.0, host.zoom)?)
        .and_then(|()| floating.show())
        .and_then(|()| floating.set_focus());
    if result.is_err() {
        let _ = floating.destroy();
        let _ = child_view(&app, &label, &host, true);
        return Err("Could not show moderation window".into());
    }
    Ok(())
}

#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct VideoSlot {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn parse_video_slot(raw: &str) -> Result<Option<VideoSlot>, String> {
    if raw.len() > 1024 {
        return Err("Invalid moderation video geometry".into());
    }
    let slot: Option<VideoSlot> =
        serde_json::from_str(raw).map_err(|_| "Invalid moderation video geometry")?;
    if let Some(r) = slot {
        if ![r.x, r.y, r.width, r.height].iter().all(|v| v.is_finite())
            || r.x < 0.0
            || r.y < 0.0
            || r.width < 0.15
            || r.height < 0.15
            || r.x + r.width > 1.00001
            || r.y + r.height > 1.00001
        {
            return Err("Invalid moderation video geometry".into());
        }
    }
    Ok(slot)
}

const VIDEO_SLOT_SCRIPT: &str = r#"(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!vw || !vh || !location.pathname.startsWith('/moderator/')) return null;
  const candidates = [...document.querySelectorAll('video, iframe[src^="https://player.twitch.tv/"]')]
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width >= 320 && r.height >= 180 && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const r = candidates[0];
  return r ? { x:r.left/vw, y:r.top/vh, width:r.width/vw, height:r.height/vh } : null;
})()"#;

#[tauri::command]
pub async fn get_official_modview_video_bounds(
    app: AppHandle,
    webview: Webview,
    session: String,
) -> Result<Option<VideoSlot>, String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let host = host_snapshot(&session)?;
    let Some(view) = app.get_webview(&label) else {
        return Ok(None);
    };
    let url = view.url().map_err(|_| "Moderation location unavailable")?;
    if !allowed_navigation(&url)
        || url.path().trim_end_matches('/') != official_url(&host.channel)?.path()
    {
        return Ok(None);
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    let send = Mutex::new(Some(send));
    view.eval_with_callback(VIDEO_SLOT_SCRIPT, move |raw| {
        if let Ok(mut slot) = send.lock() {
            if let Some(send) = slot.take() {
                let _ = send.send(raw);
            }
        }
    })
    .map_err(|_| "Could not measure moderation video")?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(2), receive)
        .await
        .map_err(|_| "Moderation video measurement timed out")?
        .map_err(|_| "Moderation video measurement interrupted")?;
    let Some(current) = app.get_webview(&label) else {
        return Ok(None);
    };
    let current_url = current
        .url()
        .map_err(|_| "Moderation location unavailable")?;
    if !allowed_navigation(&current_url)
        || current_url.path().trim_end_matches('/') != official_url(&host.channel)?.path()
    {
        return Ok(None);
    }
    parse_video_slot(&raw)
}
#[tauri::command]
pub async fn unmount_official_modview(
    app: AppHandle,
    webview: Webview,
    session: String,
) -> Result<(), String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(view) = app.get_webview(&label) {
        view.close()
            .map_err(|_| "Could not close Twitch moderation")?;
    }
    if let Some(window) = app.get_window(&detached_label(&session)?) {
        window
            .destroy()
            .map_err(|_| "Could not close moderation window")?;
    }
    HOSTS
        .lock()
        .map_err(|_| "Moderation state unavailable")?
        .remove(&session);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_normalized_video_geometry_leaves_the_remote_view() {
        let slot = parse_video_slot(r#"{"x":0.05,"y":0.1,"width":0.55,"height":0.5}"#)
            .unwrap()
            .unwrap();
        assert_eq!(slot.x, 0.05);
        assert!(parse_video_slot("null").unwrap().is_none());
        for raw in [
            r#"{"x":-1,"y":0,"width":0.6,"height":0.5}"#,
            r#"{"x":0.6,"y":0,"width":0.6,"height":0.5}"#,
            r#"{"x":0,"y":0,"width":0.01,"height":0.5}"#,
            r#"{"x":0,"y":0,"width":0.6,"height":0.5,"token":"private"}"#,
        ] {
            assert!(parse_video_slot(raw).is_err());
        }
        assert!(parse_video_slot(&" ".repeat(1025)).is_err());
    }
    #[test]
    fn zoom_is_bounded_and_automatic_layout_keeps_tool_columns_wider() {
        assert_eq!(zoom_factor(1152.0, None).unwrap(), 0.8);
        assert_eq!(zoom_factor(1920.0, None).unwrap(), 1.0);
        assert_eq!(zoom_factor(500.0, None).unwrap(), 0.65);
        assert_eq!(zoom_factor(1152.0, Some(1.0)).unwrap(), 1.0);
        for value in [f64::NAN, f64::INFINITY, 0.0, 0.1, 2.0] {
            assert!(zoom_factor(1152.0, Some(value)).is_err());
        }
    }
    #[test]
    fn only_fixed_twitch_moderation_routes() {
        assert_eq!(
            official_url("AlbertPlayXD").unwrap().as_str(),
            "https://www.twitch.tv/moderator/albertplayxd"
        );
        for channel in ["../main", "foo/bar", "", "https://evil.test"] {
            assert!(official_url(channel).is_err());
        }
        for url in [
            "http://www.twitch.tv/",
            "https://twitch.tv.evil.test/",
            "https://evil.test/",
            "tauri://localhost/",
        ] {
            assert!(!allowed_navigation(&url.parse().unwrap()));
        }
        assert!(allowed_navigation(
            &"https://passport.twitch.tv/".parse().unwrap()
        ));
    }
    #[test]
    fn sessions_cannot_address_other_webviews() {
        assert!(host_label("main").is_err());
        assert!(host_label("../embedded_twitch_chat").is_err());
        assert_ne!(
            host_label(&"a".repeat(32)).unwrap(),
            host_label(&"b".repeat(32)).unwrap()
        );
        assert!(detached_label("main").is_err());
        assert_eq!(
            detached_label(&"a".repeat(32)).unwrap(),
            format!("modview_tools_{}", "a".repeat(32))
        );
    }
}
