use tauri::{AppHandle, Manager, Webview};

static HOST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) fn host_label(session: &str) -> Result<String, String> {
    if session.len() != 32 || !session.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Sesión de inventario inválida".to_string());
    }
    Ok(format!("embedded_drops_{session}"))
}

fn trusted_ui(label: &str, url: &tauri::Url) -> bool {
    label == "main"
        && (url.scheme() == "tauri"
            || (matches!(url.scheme(), "http" | "https")
                && matches!(
                    url.host_str(),
                    Some("tauri.localhost" | "localhost" | "127.0.0.1")
                )))
}

pub(crate) fn require_ui(caller: &Webview) -> Result<(), String> {
    if !trusted_ui(
        caller.label(),
        &caller.url().map_err(|_| "No se pudo verificar la UI")?,
    ) {
        return Err("Solo la interfaz local puede controlar el inventario".to_string());
    }
    Ok(())
}

fn valid_bounds(x: f64, y: f64, width: f64, height: f64) -> bool {
    [x, y, width, height].iter().all(|v| v.is_finite())
        && x >= 0.0
        && y >= 0.0
        && width > 0.0
        && height > 0.0
}

fn check_bounds(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if !valid_bounds(x, y, width, height) {
        return Err("Dimensiones del inventario inválidas".to_string());
    }
    let window = app
        .get_window("main")
        .ok_or("Ventana principal no encontrada")?;
    let size = window
        .inner_size()
        .map_err(|_| "No se pudo medir la ventana")?
        .to_logical::<f64>(
            window
                .scale_factor()
                .map_err(|_| "No se pudo medir la escala")?,
        );
    if x + width > size.width + 2.0 || y + height > size.height + 2.0 {
        return Err("El inventario debe permanecer dentro de la ventana".to_string());
    }
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn mount_embedded_twitch_drops(
    app: AppHandle,
    webview: Webview,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    require_ui(&webview)?;
    let label = host_label(&session)?;
    check_bounds(&app, x, y, width, height)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(existing) = app.get_webview(&label) {
        existing
            .set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|_| "No se pudo posicionar el inventario")?;
        existing
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|_| "No se pudo ajustar el inventario")?;
        return existing
            .show()
            .map_err(|_| "No se pudo mostrar el inventario".to_string());
    }
    let url = "https://www.twitch.tv/drops/inventory"
        .parse()
        .map_err(|_| "URL de inventario inválida")?;
    let navigation_app = app.clone();
    let navigation_label = label.clone();
    let builder = tauri::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url))
        .on_navigation(|url| url.scheme() == "https")
        .on_new_window(move |url, _| {
            // Account-link/login clicks stay in this panel, never in a second app window.
            if url.scheme() == "https" {
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
    app.get_window("main")
        .ok_or("Ventana principal no encontrada")?
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|_| "No se pudo crear el inventario integrado".to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_embedded_twitch_drops_bounds(
    app: AppHandle,
    webview: Webview,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: Option<bool>,
) -> Result<(), String> {
    require_ui(&webview)?;
    let label = host_label(&session)?;
    check_bounds(&app, x, y, width, height)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(view) = app.get_webview(&label) {
        if visible == Some(false) {
            return view
                .hide()
                .map_err(|_| "No se pudo ocultar el inventario".to_string());
        }
        view.set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|_| "No se pudo posicionar el inventario")?;
        view.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|_| "No se pudo ajustar el inventario")?;
        view.show()
            .map_err(|_| "No se pudo mostrar el inventario")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_embedded_twitch_drops(
    app: AppHandle,
    webview: Webview,
    session: String,
) -> Result<(), String> {
    require_ui(&webview)?;
    let label = host_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    let view = app
        .get_webview(&label)
        .ok_or("El inventario integrado se ha cerrado")?;
    view.navigate(
        "https://www.twitch.tv/drops/inventory"
            .parse()
            .map_err(|_| "URL de inventario inválida")?,
    )
    .map_err(|_| "No se pudo volver al inventario".to_string())
}

#[tauri::command]
pub async fn unmount_embedded_twitch_drops(
    app: AppHandle,
    webview: Webview,
    session: String,
) -> Result<(), String> {
    require_ui(&webview)?;
    let label = host_label(&session)?;
    let _guard = HOST_LOCK.lock().await;
    if let Some(view) = app.get_webview(&label) {
        view.close()
            .map_err(|_| "No se pudo cerrar el inventario integrado")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn labels_are_session_scoped_and_reject_arbitrary_webviews() {
        assert!(host_label("embedded_twitch_chat").is_err());
        assert!(host_label("../main").is_err());
        assert_ne!(
            host_label(&"a".repeat(32)).unwrap(),
            host_label(&"b".repeat(32)).unwrap()
        );
    }
    #[test]
    fn remote_pages_cannot_control_native_inventory() {
        assert!(trusted_ui(
            "main",
            &"http://tauri.localhost/".parse().unwrap()
        ));
        assert!(trusted_ui("main", &"tauri://localhost/".parse().unwrap()));
        assert!(!trusted_ui(
            "main",
            &"https://www.twitch.tv/".parse().unwrap()
        ));
        assert!(!trusted_ui(
            "embedded_drops_123",
            &"http://tauri.localhost/".parse().unwrap()
        ));
    }
    #[test]
    fn bounds_reject_nonfinite_negative_and_empty_values() {
        assert!(valid_bounds(0.0, 100.0, 500.0, 300.0));
        assert!(!valid_bounds(f64::NAN, 0.0, 500.0, 300.0));
        assert!(!valid_bounds(0.0, 0.0, f64::INFINITY, 300.0));
        assert!(!valid_bounds(-1.0, 0.0, 500.0, 300.0));
        assert!(!valid_bounds(0.0, 0.0, 500.0, 0.0));
    }
}
