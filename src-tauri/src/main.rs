// ─── Control Desktop Application ────────────────────────────────────────
// Native Tauri application for desktop-wide agent orchestration

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;

use tauri::generate_handler;

fn main() {
    tauri::Builder::default()
        .manage(commands::TerminalRegistry::default())
        .manage(commands::WatcherRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(generate_handler![
            commands::cmd_data_export,
            commands::cmd_data_import,
            commands::cmd_data_topology_get,
            commands::cmd_data_topology_set,
            commands::cmd_data_topology_use_local,
            commands::cmd_secure_credential_self_test,
            commands::cmd_provider_credentials_list,
            commands::cmd_provider_credential_set,
            commands::cmd_provider_credential_delete,
            commands::cmd_launch_projects,
            commands::cmd_launch_forget_projects,
            commands::cmd_self_test_config,
            commands::cmd_project_inspect,
            commands::cmd_project_create,
            commands::cmd_project_test_command,
            commands::cmd_task_attachment_write,
            commands::cmd_agent_run_start,
            commands::cmd_agent_run_stop,
            commands::cmd_process_is_running,
            commands::cmd_runtime_availability,
            commands::cmd_agent_chat,
            commands::cmd_git_status,
            commands::cmd_git_stage,
            commands::cmd_git_commit,
            commands::cmd_git_diff,
            commands::cmd_git_file_content,
            commands::cmd_git_unstage,
            commands::cmd_git_history,
            commands::cmd_git_sync,
            commands::cmd_git_branches,
            commands::cmd_git_switch_branch,
            commands::cmd_git_conflicts,
            commands::cmd_git_resolve_conflict,
            commands::cmd_git_auto_resolve_conflicts,
            commands::cmd_explorer_tree,
            commands::cmd_file_save,
            commands::cmd_file_read,
            commands::cmd_file_create,
            commands::cmd_file_rename,
            commands::cmd_file_delete,
            commands::cmd_terminal_create_session,
            commands::cmd_terminal_execute,
            commands::cmd_terminal_session_open,
            commands::cmd_terminal_session_write,
            commands::cmd_terminal_session_resize,
            commands::cmd_terminal_session_cwd,
            commands::cmd_terminal_session_close,
            commands::cmd_watch_directory,
            commands::cmd_unwatch_directory,
            commands::cmd_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
