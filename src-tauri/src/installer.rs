use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{command, AppHandle};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Ejecuta un script de PowerShell en segundo plano de manera invisible
fn run_powershell_script(script: &str) -> Result<(), String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| format!("Fallo al ejecutar PowerShell: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Error en script PowerShell: {}", err_msg));
    }
    Ok(())
}

/// Detecta en qué modo debe funcionar la aplicación analizando argumentos y nombre de archivo
pub fn detect_bootstrapper_mode() -> String {
    let args: Vec<String> = env::args().collect();
    for arg in &args {
        let lower = arg.to_lowercase();
        if lower == "--setup" || lower == "--install" || lower == "-i" {
            return "installer".to_string();
        }
        if lower == "--uninstall" || lower == "-u" || lower == "--remove" {
            return "uninstaller".to_string();
        }
    }

    // Si no hay argumentos explícitos, analizamos el nombre del ejecutable
    if let Ok(exe_path) = env::current_exe() {
        if let Some(file_name_os) = exe_path.file_name() {
            let name_str = file_name_os.to_string_lossy().to_lowercase();
            if name_str.contains("setup") || name_str.starts_with("install") {
                return "installer".to_string();
            }
            if name_str.contains("uninstall") || name_str.starts_with("remove") {
                return "uninstaller".to_string();
            }
        }
    }

    "app".to_string()
}

/// Comando IPC para que el frontend consulte el modo actual ("installer", "uninstaller" o "app")
#[command]
pub fn get_bootstrapper_mode() -> String {
    detect_bootstrapper_mode()
}

/// Devuelve la ruta por defecto de instalación (en AppData\Local\Programs\BlinkStream)
#[command]
pub fn get_default_install_dir() -> String {
    if let Ok(local_app_data) = env::var("LOCALAPPDATA").or_else(|_| env::var("APPDATA")) {
        Path::new(&local_app_data).join("Programs").join("BlinkStream").to_string_lossy().to_string()
    } else {
        "C:\\Programs\\BlinkStream".to_string()
    }
}

/// Realiza la instalación en la ruta elegida (o por defecto), crea accesos directos y registra la app en Windows
#[command]
pub async fn install_blinkstream_custom(desktop_shortcut: bool, start_menu_shortcut: bool, target_dir: Option<String>) -> Result<(), String> {
    // Usamos spawn_blocking para no bloquear el event loop durante la copia de archivos
    tokio::task::spawn_blocking(move || {
        let current_exe = env::current_exe().map_err(|e| format!("Error al obtener ejecutable actual: {}", e))?;
        let local_app_data = env::var("LOCALAPPDATA")
            .or_else(|_| env::var("APPDATA"))
            .map_err(|e| format!("No se pudo obtener directorio del usuario: {}", e))?;
        
        let install_dir = if let Some(ref dir) = target_dir {
            if !dir.trim().is_empty() {
                std::path::PathBuf::from(dir.trim())
            } else {
                Path::new(&local_app_data).join("Programs").join("BlinkStream")
            }
        } else {
            Path::new(&local_app_data).join("Programs").join("BlinkStream")
        };
        fs::create_dir_all(&install_dir).map_err(|e| format!("No se pudo crear directorio de destino (si seleccionaste Archivos de Programa asegúrate de abrir el instalador como Administrador): {}", e))?;

        let main_exe = install_dir.join("BlinkStream.exe");
        let uninstaller_exe = install_dir.join("Uninstall.exe");

        // Si existe un proceso de BlinkStream.exe ejecutándose en segundo plano, lo cerramos de forma pacífica para poder sobrescribir sus archivos sin errores de bloqueo de Windows
        if let Some(file_name) = current_exe.file_name() {
            if file_name.to_string_lossy().to_lowercase() != "blinkstream.exe" {
                let mut kill_cmd = Command::new("taskkill");
                kill_cmd.args(["/F", "/IM", "BlinkStream.exe"]);
                #[cfg(windows)]
                kill_cmd.creation_flags(CREATE_NO_WINDOW);
                let _ = kill_cmd.output();
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
        }

        // Copiamos los binarios
        fs::copy(&current_exe, &main_exe).map_err(|e| format!("Fallo al copiar ejecutable principal: {}", e))?;
        fs::copy(&current_exe, &uninstaller_exe).map_err(|e| format!("Fallo al copiar desinstalador: {}", e))?;

        let main_exe_str = main_exe.to_string_lossy().replace("'", "''");
        let uninstaller_exe_str = uninstaller_exe.to_string_lossy().replace("'", "''");
        let install_dir_str = install_dir.to_string_lossy().replace("'", "''");

        let mut ps_script = String::new();
        ps_script.push_str("$WshShell = New-Object -comObject WScript.Shell;\n");

        if desktop_shortcut {
            ps_script.push_str(&format!(
                "$Shortcut = $WshShell.CreateShortcut(\"$([Environment]::GetFolderPath('Desktop'))\\BlinkStream.lnk\"); \
                 $Shortcut.TargetPath = '{}'; \
                 $Shortcut.Description = 'BlinkStream - El cliente de Twitch ultralight de nueva generación'; \
                 $Shortcut.WorkingDirectory = '{}'; \
                 $Shortcut.IconLocation = '{},0'; \
                 $Shortcut.Save();\n",
                main_exe_str, install_dir_str, main_exe_str
            ));
        }

        if start_menu_shortcut {
            ps_script.push_str(&format!(
                "$StartMenu = \"$([Environment]::GetFolderPath('Programs'))\\BlinkStream\"; \
                 New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null; \
                 $Shortcut = $WshShell.CreateShortcut(\"$StartMenu\\BlinkStream.lnk\"); \
                 $Shortcut.TargetPath = '{}'; \
                 $Shortcut.Description = 'BlinkStream'; \
                 $Shortcut.WorkingDirectory = '{}'; \
                 $Shortcut.IconLocation = '{},0'; \
                 $Shortcut.Save(); \
                 $UninstallShortcut = $WshShell.CreateShortcut(\"$StartMenu\\Desinstalar BlinkStream.lnk\"); \
                 $UninstallShortcut.TargetPath = '{}'; \
                 $UninstallShortcut.Description = 'Desinstalar BlinkStream'; \
                 $UninstallShortcut.IconLocation = '{},0'; \
                 $UninstallShortcut.Save();\n",
                main_exe_str, install_dir_str, main_exe_str, uninstaller_exe_str, uninstaller_exe_str
            ));
        }

        // Registro de Windows en 'Agregar o Quitar Programas'
        ps_script.push_str(&format!(
            "$RegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BlinkStream'; \
             New-Item -Path $RegPath -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'DisplayName' -Value 'BlinkStream' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'DisplayVersion' -Value '1.3.1-a' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'Publisher' -Value 'BlinkStream Team' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'InstallLocation' -Value '\"{}\"' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'UninstallString' -Value '\"{}\"' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'DisplayIcon' -Value '\"{},0\"' -PropertyType String -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null; \
             New-ItemProperty -Path $RegPath -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null;\n",
            install_dir_str, uninstaller_exe_str, main_exe_str
        ));

        run_powershell_script(&ps_script)?;

        // Iniciar en segundo plano (sin ventana) la instalación silenciosa de Streamlink y FFmpeg para ordenadores nuevos
        #[cfg(windows)]
        {
            let mut w_sl = Command::new("winget");
            w_sl.args(["install", "Streamlink.Streamlink", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
                .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            w_sl.creation_flags(CREATE_NO_WINDOW);
            let _ = w_sl.spawn();

            let mut w_ff = Command::new("winget");
            w_ff.args(["install", "Gyan.FFmpeg", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
                .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            w_ff.creation_flags(CREATE_NO_WINDOW);
            let _ = w_ff.spawn();
        }

        Ok(())
    }).await.map_err(|e| format!("Error en hilo de ejecución de instalación: {}", e))?
}

/// Inicia la aplicación recién instalada de manera independiente y cierra el instalador
#[command]
pub fn launch_installed_app_and_exit(app: AppHandle, target_dir: Option<String>) -> Result<(), String> {
    let install_dir = if let Some(ref dir) = target_dir {
        if !dir.trim().is_empty() {
            std::path::PathBuf::from(dir.trim())
        } else {
            let local_app_data = env::var("LOCALAPPDATA").or_else(|_| env::var("APPDATA")).map_err(|e| e.to_string())?;
            Path::new(&local_app_data).join("Programs").join("BlinkStream")
        }
    } else {
        let local_app_data = env::var("LOCALAPPDATA").or_else(|_| env::var("APPDATA")).map_err(|e| e.to_string())?;
        Path::new(&local_app_data).join("Programs").join("BlinkStream")
    };
    let main_exe = install_dir.join("BlinkStream.exe");
    
    if main_exe.exists() {
        let mut cmd = Command::new(&main_exe);
        if let Some(parent) = main_exe.parent() {
            cmd.current_dir(parent);
        }
        cmd.spawn().map_err(|e| format!("No se pudo arrancar BlinkStream.exe: {}", e))?;
    }
    app.exit(0);
    Ok(())
}

/// Ejecuta la desinstalación limpiando accesos directos, registro y borrando la carpeta de programa en segundo plano
#[command]
pub async fn uninstall_blinkstream_custom(app: AppHandle, remove_data: bool) -> Result<(), String> {
    let app_handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let local_app_data = env::var("LOCALAPPDATA").or_else(|_| env::var("APPDATA")).map_err(|e| e.to_string())?;
        let default_dir = Path::new(&local_app_data).join("Programs").join("BlinkStream");
        
        let install_dir = if let Ok(cur_exe) = env::current_exe() {
            if let Some(parent) = cur_exe.parent() {
                if parent.to_string_lossy().to_lowercase().contains("blinkstream") {
                    parent.to_path_buf()
                } else {
                    default_dir
                }
            } else {
                default_dir
            }
        } else {
            default_dir
        };
        let install_dir_str = install_dir.to_string_lossy().replace("'", "''");

        // Cerramos cualquier instancia en ejecución de BlinkStream.exe antes de desinstalar
        let mut kill_cmd = Command::new("taskkill");
        kill_cmd.args(["/F", "/IM", "BlinkStream.exe"]);
        #[cfg(windows)]
        kill_cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = kill_cmd.output();
        std::thread::sleep(std::time::Duration::from_millis(300));

        let mut ps_script = String::new();
        // Borramos accesos directos del escritorio, menú inicio y registro
        ps_script.push_str(
            "Remove-Item -Path \"$([Environment]::GetFolderPath('Desktop'))\\BlinkStream.lnk\" -Force -ErrorAction SilentlyContinue; \
             Remove-Item -Path \"$([Environment]::GetFolderPath('Programs'))\\BlinkStream\" -Recurse -Force -ErrorAction SilentlyContinue; \
             Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BlinkStream' -Recurse -Force -ErrorAction SilentlyContinue;\n"
        );

        if remove_data {
            let targets = ["com.blinkstream.desktop", "com.blinkstream.app", "BlinkStream"];
            for target in &targets {
                if let Ok(app_data) = env::var("APPDATA") {
                    let data_path = Path::new(&app_data).join(target);
                    let data_str = data_path.to_string_lossy().replace("'", "''");
                    ps_script.push_str(&format!("Remove-Item -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue;\n", data_str));
                }
                let local_data_path = Path::new(&local_app_data).join(target);
                let local_data_str = local_data_path.to_string_lossy().replace("'", "''");
                ps_script.push_str(&format!("Remove-Item -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue;\n", local_data_str));
            }
        }

        run_powershell_script(&ps_script)?;

        // Como Uninstall.exe se está ejecutando desde install_dir, programamos su borrado en segundo plano tras 2 segundos de espera
        let cleanup_script = format!(
            "Start-Sleep -Seconds 2; Remove-Item -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue",
            install_dir_str
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &cleanup_script]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();

        app_handle.exit(0);
        Ok(())
    }).await.map_err(|e| format!("Error en hilo de ejecución de desinstalación: {}", e))?
}
