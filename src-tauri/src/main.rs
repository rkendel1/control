// ─── Control Desktop Application ────────────────────────────────────────
// Native Tauri application for desktop-wide agent orchestration

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;

use control::ControlCore;
use std::sync::Arc;
use tauri::{
    generate_handler, prelude::*, window::WindowBuilder, AppHandle, GlobalShortcutManager,
    Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, WindowEvent,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Initialize Control core
            let app_handle = app.handle();
            tauri::async_runtime::block_on(async {
                match ControlCore::new().await {
                    Ok(core) => {
                        app.manage(core);
                        println!("✓ Control core initialized");
                    }
                    Err(e) => {
                        eprintln!("✗ Failed to initialize Control: {}", e);
                        std::process::exit(1);
                    }
                }
            });

            // Register global hotkey (⌘+Shift+Space on macOS)
            let mut hotkey_manager = app.global_shortcut_manager();
            if cfg!(target_os = "macos") {
                hotkey_manager
                    .register("Cmd+Shift+Space", move || {
                        open_task_palette(&app_handle);
                    })
                    .ok();
            } else if cfg!(target_os = "windows") {
                hotkey_manager
                    .register("Ctrl+Shift+Space", move || {
                        open_task_palette(&app_handle);
                    })
                    .ok();
            }

            Ok(())
        })
        .system_tray(create_system_tray())
        .on_system_tray_event(handle_system_tray_event)
        .on_window_event(|event| match event.event() {
            WindowEvent::CloseRequested { api, .. } => {
                // Keep app running when window closes
                api.prevent_close();
                event.window().hide().ok();
            }
            _ => {}
        })
        .invoke_handler(generate_handler![
            commands::cmd_projects_list,
            commands::cmd_projects_add,
            commands::cmd_projects_get,
            commands::cmd_tasks_list,
            commands::cmd_task_create,
            commands::cmd_task_start,
            commands::cmd_runtimes_list,
            commands::cmd_workspaces_list,
            commands::cmd_git_status,
            commands::cmd_git_stage,
            commands::cmd_git_commit,
            commands::cmd_explorer_tree,
            commands::cmd_file_save,
            commands::cmd_file_read,
            commands::cmd_terminal_create_session,
            commands::cmd_terminal_execute,
            commands::cmd_watch_directory,
            commands::cmd_search,
            commands::cmd_detect_repository,
            commands::cmd_scan_directory,
            commands::cmd_index_project,
            cmd_daemon_status,
            cmd_open_project_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── System Tray ────────────────────────────────────────────────────────

fn create_system_tray() -> SystemTray {
    let tray_menu = SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::new("Open Control", "open_control"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("Quick Task (⌘+Shift+Space)", "quick_task"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("Pause New Work", "pause_work"))
        .add_item(SystemTrayMenuItem::new("View Active Runs", "view_runs"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("Quit Control", "quit_control"));

    SystemTray::new().with_menu(tray_menu)
}

fn handle_system_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "open_control" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quick_task" => {
                open_task_palette(app);
            }
            "pause_work" => {
                // TODO: Pause new work
            }
            "view_runs" => {
                // TODO: Show active runs
            }
            "quit_control" => {
                std::process::exit(0);
            }
            _ => {}
        },
        _ => {}
    }
}

// ─── Global Hotkey Handler ──────────────────────────────────────────────

fn open_task_palette(app: &AppHandle) {
    if let Some(window) = app.get_window("task_palette") {
        let _ = window.show();
        let _ = window.set_focus();
    } else if let Ok(window) = WindowBuilder::new(app, "task_palette", tauri::WindowUrl::App("task_palette".into()))
        .title("Quick Task")
        .resizable(false)
        .always_on_top(true)
        .decorations(false)
        .transparent(true)
        .build()
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ─── Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn cmd_daemon_status(core: tauri::State<'_, ControlCore>) -> Result<DaemonStatus, String> {
    // Gather status info
    Ok(DaemonStatus {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // TODO: track uptime
        pid: std::process::id(),
        projects_count: core
            .projects()
            .read()
            .await
            .list()
            .map(|p| p.len())
            .unwrap_or(0),
        tasks_count: 0, // TODO: count tasks
        active_runs: 0, // TODO: count active runs
        runtimes: vec![],
    })
}

#[tauri::command]
async fn cmd_open_project_folder() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::api::dialog;
        // Open native file picker
        match dialog::blocking::FileDialogBuilder::new().pick_folder() {
            Some(path) => Ok(path.to_string_lossy().to_string()),
            None => Err("No folder selected".to_string()),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Not implemented for this platform".to_string())
    }
}

#[derive(serde::Serialize)]
struct DaemonStatus {
    version: String,
    uptime_seconds: u64,
    pid: u32,
    projects_count: usize,
    tasks_count: usize,
    active_runs: usize,
    runtimes: Vec<RuntimeStatus>,
}

#[derive(serde::Serialize)]
struct RuntimeStatus {
    name: String,
    available: bool,
}
