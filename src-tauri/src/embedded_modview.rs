use tauri::{AppHandle, Manager, Webview};

static HOST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn host_label(session: &str) -> Result<String, String> {
    if session.len() != 32 || !session.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid moderation session".into());
    }
    Ok(format!("official_modview_{session}"))
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
) -> Result<(), String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let url = official_url(&channel)?;
    crate::embedded_drops::check_bounds(&app, x, y, width, height)?;
    let zoom = zoom_factor(width, zoom)?;
    let _guard = HOST_LOCK.lock().await;
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    let navigation_app = app.clone();
    let navigation_label = label.clone();
    // Keep Twitch's own UI/session intact. Remote content receives no native capabilities.
    let builder = tauri::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url))
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
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|_| "Could not open Twitch moderation".to_string())?;
    if child.set_zoom(zoom).is_err() {
        let _ = child.close();
        return Err("Could not scale Twitch moderation".into());
    }
    Ok(())
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
) -> Result<(), String> {
    crate::embedded_drops::require_ui(&webview)?;
    let label = host_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(view) = app.get_webview(&label) {
        if !visible {
            return view
                .hide()
                .map_err(|_| "Could not hide Twitch moderation".into());
        }
        crate::embedded_drops::check_bounds(&app, x, y, width, height)?;
        let zoom = zoom_factor(width, zoom)?;
        view.set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|_| "Could not position Twitch moderation")?;
        view.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|_| "Could not resize Twitch moderation")?;
        view.set_zoom(zoom)
            .map_err(|_| "Could not scale Twitch moderation")?;
        view.show()
            .map_err(|_| "Could not show Twitch moderation")?;
    }
    Ok(())
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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
    }
}
