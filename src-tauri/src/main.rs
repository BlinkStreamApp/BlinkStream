#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn show_startup_message(message: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            window: *const std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            kind: u32,
        ) -> i32;
    }
    let text: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
    let caption: Vec<u16> = "BlinkStream".encode_utf16().chain(Some(0)).collect();
    // Buffers remain alive and NUL-terminated for the synchronous Windows call.
    unsafe {
        MessageBoxW(std::ptr::null(), text.as_ptr(), caption.as_ptr(), 0x30);
    }
}

#[cfg(all(windows, feature = "microsoft-store"))]
fn missing_webview_message(language: u16) -> &'static str {
    match language & 0x03ff {
        0x0a => "Blink Stream necesita Microsoft Edge WebView2 Runtime (Evergreen).\n\nInstálalo desde la web oficial de Microsoft y vuelve a abrir la app:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nNo se instalará ningún componente automáticamente.",
        0x0c => "Blink Stream nécessite Microsoft Edge WebView2 Runtime (Evergreen).\n\nInstallez-le depuis le site officiel Microsoft, puis relancez l’application :\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nAucun composant ne sera installé automatiquement.",
        0x07 => "Blink Stream benötigt Microsoft Edge WebView2 Runtime (Evergreen).\n\nInstallieren Sie die Runtime von der offiziellen Microsoft-Website und starten Sie die App erneut:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nEs werden keine Komponenten automatisch installiert.",
        0x16 => "O Blink Stream precisa do Microsoft Edge WebView2 Runtime (Evergreen).\n\nInstale-o pelo site oficial da Microsoft e abra o app novamente:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nNenhum componente será instalado automaticamente.",
        0x11 => "Blink Stream には Microsoft Edge WebView2 Runtime (Evergreen) が必要です。\n\nMicrosoft の公式サイトからインストールし、アプリを再起動してください：\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nコンポーネントは自動的にはインストールされません。",
        0x12 => "Blink Stream에는 Microsoft Edge WebView2 Runtime (Evergreen)이 필요합니다.\n\nMicrosoft 공식 사이트에서 설치한 후 앱을 다시 실행하세요:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\n구성 요소는 자동으로 설치되지 않습니다.",
        0x19 => "Для Blink Stream требуется Microsoft Edge WebView2 Runtime (Evergreen).\n\nУстановите его с официального сайта Microsoft и снова откройте приложение:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nКомпоненты не устанавливаются автоматически.",
        _ => "Blink Stream requires Microsoft Edge WebView2 Runtime (Evergreen).\n\nInstall it from the official Microsoft website, then reopen the app:\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\nNo components will be installed automatically.",
    }
}

fn main() {
    if !blinkstream_lib::try_lock_single_instance("BlinkStream_App") {
        #[cfg(windows)]
        {
            let msg = "BlinkStream ya está en ejecución.\n\nCierra la ventana existente antes de abrir una nueva.";
            show_startup_message(msg);
        }
        #[cfg(not(windows))]
        {
            eprintln!("BlinkStream ya está en ejecución. Cierra la instancia existente.");
        }
        return;
    }
    #[cfg(all(windows, feature = "microsoft-store"))]
    if tauri::webview_version().is_err() {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetUserDefaultUILanguage() -> u16;
        }
        // OS language is available before the application's UI/preferences load.
        show_startup_message(missing_webview_message(unsafe {
            GetUserDefaultUILanguage()
        }));
        return;
    }
    blinkstream_lib::run();
}

#[cfg(all(test, windows, feature = "microsoft-store"))]
mod tests {
    #[test]
    fn missing_runtime_notice_covers_supported_os_languages() {
        let english = super::missing_webview_message(0x0409);
        for language in [
            0x040a, 0x040c, 0x0407, 0x0416, 0x0411, 0x0412, 0x0419, 0x0409,
        ] {
            let message = super::missing_webview_message(language);
            assert!(message.contains("https://developer.microsoft.com/microsoft-edge/webview2/"));
            assert!(message.contains("Evergreen"));
            assert!(!message.contains('\0'));
        }
        assert_eq!(super::missing_webview_message(0xffff), english);
    }
}
