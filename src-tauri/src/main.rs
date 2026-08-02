#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mode = blinkstream_lib::installer::detect_bootstrapper_mode();
    let mutex_name = match mode.as_str() {
        "installer" => "BlinkStream_Setup_Instance",
        "uninstaller" => "BlinkStream_Uninstaller_Instance",
        _ => "BlinkStream_App_Instance",
    };

    if !blinkstream_lib::try_lock_single_instance(mutex_name) {
        #[cfg(windows)]
        {
            use std::ptr;
            extern "system" {
                fn MessageBoxW(
                    hWnd: *const std::ffi::c_void,
                    lpText: *const u16,
                    lpCaption: *const u16,
                    uType: u32,
                ) -> i32;
            }
            let msg = if mode == "app" {
                "BlinkStream ya está en ejecución.\n\nCierra la ventana existente antes de abrir una nueva."
            } else {
                "El instalador o desinstalador de BlinkStream ya está abierto."
            };
            let text: Vec<u16> = msg
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let caption: Vec<u16> = "BlinkStream"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            unsafe {
                MessageBoxW(ptr::null(), text.as_ptr(), caption.as_ptr(), 0x40);
            }
        }
        #[cfg(not(windows))]
        {
            eprintln!("BlinkStream ya está en ejecución. Cierra la instancia existente.");
        }
        return;
    }
    blinkstream_lib::run();
}
