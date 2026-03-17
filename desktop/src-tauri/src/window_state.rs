/// Gestion centralisée des états de fenêtres (tailles, positions)
/// Partagé entre main.rs, video_app_detector.rs et mic_monitor.rs

use tauri::Manager;

/// Taille sauvegardée avant passage en mode compact (width, height en pixels physiques)
static SAVED_WINDOW_SIZE: std::sync::OnceLock<parking_lot::Mutex<Option<(u32, u32)>>> =
    std::sync::OnceLock::new();

/// Position sauvegardée de la grande fenêtre (x, y en pixels physiques)
static SAVED_LARGE_POSITION: std::sync::OnceLock<parking_lot::Mutex<Option<(i32, i32)>>> =
    std::sync::OnceLock::new();

/// Dernière position de la fenêtre compacte mémorisée (x, y en pixels physiques)
static SAVED_COMPACT_POSITION: std::sync::OnceLock<parking_lot::Mutex<Option<(i32, i32)>>> =
    std::sync::OnceLock::new();

pub fn saved_size() -> &'static parking_lot::Mutex<Option<(u32, u32)>> {
    SAVED_WINDOW_SIZE.get_or_init(|| parking_lot::Mutex::new(None))
}

pub fn saved_large_position() -> &'static parking_lot::Mutex<Option<(i32, i32)>> {
    SAVED_LARGE_POSITION.get_or_init(|| parking_lot::Mutex::new(None))
}

pub fn saved_compact_position() -> &'static parking_lot::Mutex<Option<(i32, i32)>> {
    SAVED_COMPACT_POSITION.get_or_init(|| parking_lot::Mutex::new(None))
}

/// Passe la fenêtre "main" en mode compact bas à droite.
/// Utilisé depuis video_app_detector et mic_monitor après confirmation de la notification.
pub fn enter_compact_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_window("main") {
        // Sauvegarder taille et position de la grande fenêtre
        if let Ok(size) = window.inner_size() {
            if size.width > 400 {
                *saved_size().lock() = Some((size.width, size.height));
            }
        }
        if let Ok(pos) = window.outer_position() {
            *saved_large_position().lock() = Some((pos.x, pos.y));
        }

        // Cacher la fenêtre AVANT de la redimensionner pour éviter l'effet
        // "taille intermédiaire" visible à l'écran
        let _ = window.hide();

        let _ = window.set_decorations(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_resizable(false);
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: 160.0, height: 260.0 }));

        // Utiliser la position compacte mémorisée, sinon bas à droite
        let saved_pos = *saved_compact_position().lock();
        if let Some((sx, sy)) = saved_pos {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: sx, y: sy }
            ));
        } else if let Some(monitor) = window.current_monitor().ok().flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
        {
            let screen = monitor.size();
            let scale = monitor.scale_factor();
            let w_phys = (160.0 * scale) as u32;
            let h_phys = (260.0 * scale) as u32;
            let margin = (20.0 * scale) as i32;
            let x = screen.width as i32 - w_phys as i32 - margin;
            let y = screen.height as i32 - h_phys as i32 - margin;
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x, y }
            ));
        }

        // Laisser la fenêtre s'afficher et WebKit re-layouter avant d'émettre l'event
        // 60ms pour le resize physique + 100ms pour le layout WebKit
        std::thread::sleep(std::time::Duration::from_millis(160));
        let _ = window.show();
        let _ = window.set_focus();

        // Émettre APRÈS show() — WebKit reçoit l'event quand la fenêtre est déjà visible
        // et a la bonne taille → window.innerWidth retourne la valeur correcte
        std::thread::sleep(std::time::Duration::from_millis(50));
        let _ = window.emit("compact-mode-changed", true);

        // Watcher de position pour mémoriser les déplacements en compact
        let app_clone = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(200));
            loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Some(win) = app_clone.get_window("main") {
                    if let Ok(size) = win.inner_size() {
                        if size.width > 400 { break; }
                    }
                    if let Ok(pos) = win.outer_position() {
                        *saved_compact_position().lock() = Some((pos.x, pos.y));
                    }
                } else {
                    break;
                }
            }
        });
    }
    Ok(())
}
