// ─── Control Desktop Application ────────────────────────────────────────
// Native Tauri application for desktop-wide agent orchestration

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;

use control::ControlCore;
use tauri::generate_handler;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Initialize Control core
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

            Ok(())
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
            commands::cmd_initialize_project,
            cmd_daemon_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn cmd_daemon_status(core: tauri::State<'_, ControlCore>) -> Result<DaemonStatus, String> {
    let projects_count = match core.projects().read().await.list() {
        Ok(projects) => projects.len(),
        Err(_) => 0,
    };

    // Gather status info
    Ok(DaemonStatus {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // TODO: track uptime
        pid: std::process::id(),
        projects_count,
        tasks_count: 0, // TODO: count tasks
        active_runs: 0, // TODO: count active runs
        runtimes: vec![],
    })
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
