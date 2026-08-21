// ─── Tauri IPC Commands ──────────────────────────────────────────────────
// Desktop UI communicates with Control Core via these commands.
// No HTTP calls needed for normal UI operation.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::{collections::HashMap, sync::Arc};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncRead, AsyncReadExt};

/// Response wrapper for all IPC commands.
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

#[tauri::command]
pub fn cmd_launch_projects() -> Result<CommandResponse<Vec<String>>, String> {
    let projects = std::env::args()
        .skip(1)
        .filter_map(|argument| std::path::Path::new(&argument).canonicalize().ok())
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    Ok(CommandResponse::ok(projects))
}

#[tauri::command]
pub fn cmd_launch_forget_projects() -> Result<CommandResponse<Vec<String>>, String> {
    let projects = std::env::args()
        .skip(1)
        .filter_map(|argument| {
            argument
                .strip_prefix("--forget-project=")
                .map(str::to_owned)
        })
        .filter_map(|path| {
            std::path::Path::new(&path)
                .canonicalize()
                .ok()
                .or_else(|| Some(std::path::PathBuf::from(path)))
        })
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    Ok(CommandResponse::ok(projects))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestConfig {
    project_path: String,
    report_path: String,
}

#[tauri::command]
pub fn cmd_self_test_config() -> Result<CommandResponse<Option<SelfTestConfig>>, String> {
    let mut project_path = None;
    let mut report_path = None;
    for argument in std::env::args().skip(1) {
        if let Some(value) = argument.strip_prefix("--self-test-project=") {
            project_path = Some(value.to_string());
        } else if let Some(value) = argument.strip_prefix("--self-test-report=") {
            report_path = Some(value.to_string());
        }
    }
    Ok(CommandResponse::ok(match (project_path, report_path) {
        (Some(project_path), Some(report_path)) => Some(SelfTestConfig {
            project_path,
            report_path,
        }),
        _ => None,
    }))
}

#[tauri::command]
pub fn cmd_data_export(path: String, content: String) -> Result<CommandResponse<bool>, String> {
    match std::fs::write(&path, content) {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(format!(
            "Unable to export Control data to '{}': {}",
            path, error
        ))),
    }
}

#[tauri::command]
pub fn cmd_data_import(path: String) -> Result<CommandResponse<String>, String> {
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(CommandResponse::ok(content)),
        Err(error) => Ok(CommandResponse::err(format!(
            "Unable to read Control data from '{}': {}",
            path, error
        ))),
    }
}

const CONTROL_KEYRING_SERVICE: &str = "com.control.desktop.feltdb";
const CONTROL_KEYRING_ACCOUNT: &str = "server-token";

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredDataTopology {
    mode: String,
    server_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTopologyDTO {
    mode: String,
    server_url: Option<String>,
    has_credential: bool,
    token: Option<String>,
}

fn topology_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("data-topology.json"))
        .map_err(|error| error.to_string())
}
fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CONTROL_KEYRING_SERVICE, CONTROL_KEYRING_ACCOUNT)
        .map_err(|error| format!("OS credential store is unavailable: {error}"))
}
const PROVIDER_CREDENTIALS:[(&str,&str);4]=[("openai","OPENAI_API_KEY"),("anthropic","ANTHROPIC_API_KEY"),("openrouter","OPENROUTER_API_KEY"),("gemini","GEMINI_API_KEY")];
fn provider_credential(provider:&str)->Option<(&'static str,&'static str)>{PROVIDER_CREDENTIALS.iter().copied().find(|(id,_)|*id==provider)}
fn provider_entry(provider:&str)->Result<keyring::Entry,String>{if provider_credential(provider).is_none(){return Err("Unsupported provider credential".into());}keyring::Entry::new(CONTROL_KEYRING_SERVICE,&format!("provider:{provider}")).map_err(|error|format!("OS credential store is unavailable: {error}"))}

#[derive(Debug,Serialize,Clone)]
#[serde(rename_all="camelCase")]
pub struct ProviderCredentialStatusDTO{provider:String,environment_variable:String,configured:bool}

#[tauri::command]
pub fn cmd_provider_credentials_list()->Result<CommandResponse<Vec<ProviderCredentialStatusDTO>>,String>{Ok(CommandResponse::ok(PROVIDER_CREDENTIALS.iter().map(|(provider,environment)|ProviderCredentialStatusDTO{provider:(*provider).into(),environment_variable:(*environment).into(),configured:provider_entry(provider).and_then(|entry|entry.get_password().map_err(|error|error.to_string())).map(|value|!value.trim().is_empty()).unwrap_or(false)}).collect()))}

#[tauri::command]
pub fn cmd_provider_credential_set(provider:String,credential:String)->Result<CommandResponse<bool>,String>{if credential.trim().is_empty(){return Ok(CommandResponse::err("Credential cannot be empty".into()));}match provider_entry(&provider).and_then(|entry|entry.set_password(credential.trim()).map_err(|error|format!("Unable to save provider credential: {error}"))){Ok(())=>Ok(CommandResponse::ok(true)),Err(error)=>Ok(CommandResponse::err(error))}}

#[tauri::command]
pub fn cmd_provider_credential_delete(provider:String)->Result<CommandResponse<bool>,String>{match provider_entry(&provider).and_then(|entry|match entry.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(error)=>Err(format!("Unable to remove provider credential: {error}"))}){Ok(())=>Ok(CommandResponse::ok(true)),Err(error)=>Ok(CommandResponse::err(error))}}
fn read_topology(app: &AppHandle) -> Result<StoredDataTopology, String> {
    let path = topology_path(app)?;
    if !path.exists() {
        return Ok(StoredDataTopology {
            mode: "local".into(),
            server_url: None,
        });
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("Unable to read data topology: {error}"))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("Invalid data topology configuration: {error}"))
}
fn validate_feltdb_server_url(value: &str) -> Result<String, String> {
    let parsed = url::Url::parse(value.trim())
        .map_err(|error| format!("Invalid FeltDB server URL: {error}"))?;
    let local_http = parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if parsed.scheme() != "https" && !local_http {
        return Err("Remote FeltDB requires HTTPS (HTTP is allowed only for localhost)".into());
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

#[tauri::command]
pub fn cmd_data_topology_get(
    app: AppHandle,
    include_token: bool,
) -> Result<CommandResponse<DataTopologyDTO>, String> {
    let config = match read_topology(&app) {
        Ok(value) => value,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    let token = if config.mode == "server" {
        token_entry()
            .and_then(|entry| {
                entry
                    .get_password()
                    .map_err(|error| format!("Unable to read FeltDB credential: {error}"))
            })
            .ok()
    } else {
        None
    };
    Ok(CommandResponse::ok(DataTopologyDTO {
        mode: config.mode,
        server_url: config.server_url,
        has_credential: token.is_some(),
        token: if include_token { token } else { None },
    }))
}

#[tauri::command]
pub fn cmd_data_topology_set(
    app: AppHandle,
    server_url: String,
    token: String,
) -> Result<CommandResponse<bool>, String> {
    let server_url = match validate_feltdb_server_url(&server_url) {
        Ok(value) => value,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if token.trim().is_empty() {
        return Ok(CommandResponse::err(
            "A FeltDB access token is required".into(),
        ));
    }
    let entry = match token_entry() {
        Ok(entry) => entry,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if let Err(error) = entry.set_password(token.trim()) {
        return Ok(CommandResponse::err(format!(
            "Unable to save FeltDB token in the OS credential store: {error}"
        )));
    }
    let path = match topology_path(&app) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return Ok(CommandResponse::err(format!(
                "Unable to create Control configuration directory: {error}"
            )));
        }
    }
    let config = StoredDataTopology {
        mode: "server".into(),
        server_url: Some(server_url),
    };
    match serde_json::to_vec_pretty(&config)
        .ok()
        .and_then(|content| std::fs::write(path, content).ok())
    {
        Some(()) => Ok(CommandResponse::ok(true)),
        None => Ok(CommandResponse::err(
            "Unable to save FeltDB topology configuration".into(),
        )),
    }
}

#[tauri::command]
pub fn cmd_data_topology_use_local(app: AppHandle) -> Result<CommandResponse<bool>, String> {
    let entry = match token_entry() {
        Ok(entry) => entry,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "Unable to remove FeltDB token from the OS credential store: {error}"
            )))
        }
    }
    let path = match topology_path(&app) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if path.exists() {
        if let Err(error) = std::fs::remove_file(path) {
            return Ok(CommandResponse::err(format!(
                "Unable to clear data topology: {error}"
            )));
        }
    }
    Ok(CommandResponse::ok(true))
}

#[tauri::command]
pub fn cmd_secure_credential_self_test() -> Result<CommandResponse<bool>, String> {
    if !std::env::args().any(|argument| argument.starts_with("--self-test-project=")) {
        return Ok(CommandResponse::err(
            "Credential self-test is available only in packaged self-test mode".into(),
        ));
    }
    let account = format!("self-test-{}", uuid::Uuid::new_v4());
    let value = uuid::Uuid::new_v4().to_string();
    let entry = match keyring::Entry::new(CONTROL_KEYRING_SERVICE, &account) {
        Ok(entry) => entry,
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "OS credential store is unavailable: {error}"
            )))
        }
    };
    if let Err(error) = entry.set_password(&value) {
        return Ok(CommandResponse::err(format!(
            "Unable to write OS credential: {error}"
        )));
    }
    let result = entry
        .get_password()
        .map(|stored| stored == value)
        .map_err(|error| format!("Unable to read OS credential: {error}"));
    let cleanup = entry
        .delete_credential()
        .map_err(|error| format!("Unable to remove self-test credential: {error}"));
    match (result, cleanup) {
        (Ok(true), Ok(())) => Ok(CommandResponse::ok(true)),
        (Ok(false), _) => Ok(CommandResponse::err(
            "OS credential round-trip did not match".into(),
        )),
        (Err(error), _) | (_, Err(error)) => Ok(CommandResponse::err(error)),
    }
}

// ─── Project Commands ────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_project_inspect(
    path: String,
    name: Option<String>,
) -> Result<CommandResponse<ProjectDTO>, String> {
    let canonical = match std::path::Path::new(&path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        Ok(path) => {
            return Ok(CommandResponse::err(format!(
                "Project path is not a directory: {}",
                path.display()
            )))
        }
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "Cannot open project '{}': {}",
                path, error
            )))
        }
    };
    let project_name = name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            canonical
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("project")
                .to_string()
        });
    Ok(CommandResponse::ok(ProjectDTO {
        id: format!("project_{}", uuid::Uuid::new_v4()),
        name: project_name,
        path: canonical.to_string_lossy().to_string(),
        description: None,
        runtime: None,
    }))
}

fn detect_test_command(workspace: &std::path::Path) -> Option<String> {
    let package_json = workspace.join("package.json");
    if package_json.is_file() {
        let has_test = std::fs::read_to_string(package_json)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .and_then(|value| {
                value
                    .get("scripts")?
                    .get("test")?
                    .as_str()
                    .map(str::to_owned)
            })
            .is_some();
        if has_test {
            return Some(
                if workspace.join("pnpm-lock.yaml").is_file() {
                    "pnpm test"
                } else if workspace.join("yarn.lock").is_file() {
                    "yarn test"
                } else if workspace.join("bun.lockb").is_file()
                    || workspace.join("bun.lock").is_file()
                {
                    "bun test"
                } else {
                    "npm test"
                }
                .to_string(),
            );
        }
    }
    if workspace.join("Cargo.toml").is_file() {
        return Some("cargo test".into());
    }
    if workspace.join("pyproject.toml").is_file()
        || workspace.join("pytest.ini").is_file()
        || workspace.join("setup.cfg").is_file()
    {
        return Some(
            if workspace.join("uv.lock").is_file() {
                "uv run pytest"
            } else {
                "python -m pytest"
            }
            .into(),
        );
    }
    if workspace.join("go.mod").is_file() {
        return Some("go test ./...".into());
    }
    if workspace.join("Makefile").is_file() {
        return Some("make test".into());
    }
    None
}

#[tauri::command]
pub fn cmd_project_test_command(workspace_path: String) -> Result<CommandResponse<String>, String> {
    let workspace = match std::path::Path::new(&workspace_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => {
            return Ok(CommandResponse::err(
                "Project workspace is unavailable".into(),
            ))
        }
    };
    Ok(match detect_test_command(&workspace) {
        Some(command) => CommandResponse::ok(command),
        None => {
            CommandResponse::err("No supported test command was detected for this project".into())
        }
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeRunStartDTO {
    pub pid: u32,
    pub runtime: String,
    pub process_started_at: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeRunEvent {
    run_id: String,
    event_type: String,
    output: Option<String>,
    error: Option<String>,
    exit_code: Option<i32>,
}

fn runtime_supports_policy(runtime: &str, filesystem: &str, shell: bool, network: bool) -> bool {
    match runtime {
        "claude" | "claude-code" => !shell || (filesystem == "workspace-write" && network),
        "codex" => shell && !network && matches!(filesystem, "read-only" | "workspace-write"),
        "opencode" => filesystem == "workspace-write" && shell && network,
        "ollama" => !shell || (filesystem == "workspace-write" && network),
        _ => false,
    }
}

fn first_ollama_model(output: &str) -> Option<String> {
    output.lines().skip(1).find_map(|line| {
        line.split_whitespace()
            .next()
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    })
}
fn ollama_model(preferred: &str) -> Option<String> {
    preferred
        .strip_prefix("ollama:")
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| {
            std::env::var("CONTROL_OLLAMA_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            which::which("ollama")
                .ok()
                .and_then(|binary| std::process::Command::new(binary).arg("list").output().ok())
                .filter(|output| output.status.success())
                .and_then(|output| first_ollama_model(&String::from_utf8_lossy(&output.stdout)))
        })
}

fn valid_agent_timeout(minutes: u32) -> bool {
    (1..=240).contains(&minutes)
}

fn process_started_at(pid: u32) -> Option<u64> {
    let system = sysinfo::System::new_all();
    system
        .process(sysinfo::Pid::from_u32(pid))
        .map(sysinfo::Process::start_time)
}

fn process_identity_matches(pid: u32, expected_started_at: Option<u64>) -> bool {
    match (process_started_at(pid), expected_started_at) {
        (Some(actual), Some(expected)) => actual == expected,
        (Some(_), None) => true,
        (None, _) => false,
    }
}

#[tauri::command]
pub async fn cmd_agent_run_start(
    app: AppHandle,
    run_id: String,
    task_id: String,
    title: String,
    description: String,
    project_path: String,
    agent_name: String,
    agent_instructions: String,
    preferred_runtime: Option<String>,
    execution_filesystem: String,
    execution_shell: bool,
    execution_network: bool,
    execution_timeout_minutes: u32,
) -> Result<CommandResponse<NativeRunStartDTO>, String> {
    let workspace = match std::path::Path::new(&project_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => {
            return Ok(CommandResponse::err(
                "Project workspace is unavailable".to_string(),
            ))
        }
    };
    let prompt = format!(
        "You are the {} agent in Control.\n\n{}\n\nTask {}: {}\n\n{}\n\nEnforced execution policy: filesystem={}, shell={}, network={}. Never attempt to exceed it.\n\nComplete the task in {}. Inspect conventions, make the required changes, run relevant checks, and finish with a concise report. After each test command you actually ran, include one line formatted exactly as CONTROL_TEST: {{\"command\":\"...\",\"status\":\"passed|failed|skipped\",\"summary\":\"...\"}}. If a user decision is genuinely required, stop safely and end with one line formatted exactly as CONTROL_DECISION: {{\"question\":\"...\",\"context\":\"...\",\"options\":[\"...\",\"...\"]}}. If another active agent should continue this same Work, end instead with one line formatted exactly as CONTROL_HANDOFF: {{\"agentId\":\"...\",\"message\":\"...\",\"reason\":\"...\"}}. Never emit both decision and handoff markers.",
        agent_name,
        agent_instructions,
        task_id,
        title,
        description,
        execution_filesystem,
        execution_shell,
        execution_network,
        workspace.display()
    );
    if !matches!(
        execution_filesystem.as_str(),
        "read-only" | "workspace-write"
    ) {
        return Ok(CommandResponse::err(
            "Invalid agent filesystem policy".to_string(),
        ));
    }
    if !valid_agent_timeout(execution_timeout_minutes) {
        return Ok(CommandResponse::err(
            "Agent timeout must be between 1 and 240 minutes".to_string(),
        ));
    }
    let preferred = preferred_runtime.as_deref().unwrap_or("auto");
    let claude_supports_policy = runtime_supports_policy(
        "claude-code",
        &execution_filesystem,
        execution_shell,
        execution_network,
    );
    let codex_supports_policy = runtime_supports_policy(
        "codex",
        &execution_filesystem,
        execution_shell,
        execution_network,
    );
    let opencode_supports_policy = runtime_supports_policy(
        "opencode",
        &execution_filesystem,
        execution_shell,
        execution_network,
    );
    let ollama_supports_policy = runtime_supports_policy(
        "ollama",
        &execution_filesystem,
        execution_shell,
        execution_network,
    );
    let local_coding_available = ollama_supports_policy && runtime_available("ollama");
    let wants_frontier = preferred == "frontier";
    let wants_local = preferred == "local";
    let (runtime, mut command) = if (matches!(preferred, "auto" | "claude" | "claude-code")
        || wants_frontier)
        && (preferred != "auto" || !local_coding_available)
        && claude_supports_policy
        && runtime_available("claude-code")
    {
        let binary = which::which("claude").expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        let mut tools = vec!["Read", "Glob", "Grep"];
        if execution_filesystem == "workspace-write" {
            tools.extend(["Edit", "Write"]);
        }
        if execution_shell {
            tools.push("Bash");
        }
        command
            .arg("-p")
            .arg(&prompt)
            .arg("--no-session-persistence")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("--allowedTools")
            .args(tools);
        ("claude-code".to_string(), command)
    } else if (matches!(preferred, "auto" | "codex") || wants_frontier)
        && (preferred != "auto" || !local_coding_available)
        && codex_supports_policy
        && runtime_available("codex")
    {
        let binary = which::which("codex").expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        command
            .arg("exec")
            .args([
                "--sandbox",
                execution_filesystem.as_str(),
                "--skip-git-repo-check",
                "--ephemeral",
            ])
            .arg(&prompt);
        ("codex".to_string(), command)
    } else if (matches!(preferred, "auto" | "opencode") || wants_frontier)
        && (preferred != "auto" || !local_coding_available)
        && opencode_supports_policy
        && runtime_available("opencode")
    {
        let binary = which::which("opencode").expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        command.arg("run").arg(&prompt);
        ("opencode".to_string(), command)
    } else if (preferred == "auto" || wants_local || preferred == "ollama" || preferred.starts_with("ollama:"))
        && ollama_supports_policy
        && runtime_available("ollama")
    {
        let binary = which::which("ollama").expect("runtime checked");
        let model = ollama_model(preferred).expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        let mut tools=vec!["Read","Glob","Grep"];
        if execution_filesystem=="workspace-write"{tools.extend(["Edit","Write"]);}
        if execution_shell{tools.push("Bash");}
        command.args(["launch","claude","--model",&model,"--yes","--","-p",&prompt,"--no-session-persistence","--output-format","stream-json","--verbose","--allowedTools"]).args(tools);
        (format!("ollama-claude:{model}"), command)
    } else {
        return Ok(CommandResponse::err(format!("No available runtime can enforce filesystem={}, shell={}, network={} for configured runtime '{}'", execution_filesystem, execution_shell, execution_network, preferred)));
    };
    #[cfg(unix)]
    command.process_group(0);
    command
        .current_dir(workspace)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    if runtime=="claude-code"{if let Ok(value)=provider_entry("anthropic").and_then(|entry|entry.get_password().map_err(|error|error.to_string())){command.env("ANTHROPIC_API_KEY",value);}}
    if runtime=="codex"{if let Ok(value)=provider_entry("openai").and_then(|entry|entry.get_password().map_err(|error|error.to_string())){command.env("OPENAI_API_KEY",value);}}
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "Failed to launch {}: {}",
                runtime, error
            )))
        }
    };
    let pid = child.id().unwrap_or(0);
    let process_started_at = process_started_at(pid).unwrap_or_default();
    if process_started_at == 0 {
        let _ = child.kill().await;
        return Ok(CommandResponse::err(
            "Could not establish a durable identity for the agent process".to_string(),
        ));
    }
    let event_run_id = run_id.clone();
    let event_runtime = runtime.clone();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stream = |mut reader: Box<dyn AsyncRead + Unpin + Send>, app: AppHandle, run_id: String| {
        tauri::async_runtime::spawn(async move {
            let mut all = Vec::new();
            let mut buffer = vec![0_u8; 4096];
            loop {
                match reader.read(&mut buffer).await {
                    Ok(0) => break,
                    Ok(count) => {
                        all.extend_from_slice(&buffer[..count]);
                        let text = String::from_utf8_lossy(&buffer[..count]).to_string();
                        let _ = app.emit(
                            "agent-run-event",
                            NativeRunEvent {
                                run_id: run_id.clone(),
                                event_type: "output".to_string(),
                                output: Some(text),
                                error: None,
                                exit_code: None,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            String::from_utf8_lossy(&all).trim().to_string()
        })
    };
    let stdout_task = stdout.map(|reader| stream(Box::new(reader), app.clone(), run_id.clone()));
    let stderr_task = stderr.map(|reader| stream(Box::new(reader), app.clone(), run_id.clone()));
    tauri::async_runtime::spawn(async move {
        let timeout = std::time::Duration::from_secs(u64::from(execution_timeout_minutes) * 60);
        let wait = tokio::time::timeout(timeout, child.wait()).await;
        let (status, wait_error) = match wait {
            Ok(Ok(status)) => (Some(status), None),
            Ok(Err(error)) => (None, Some(error.to_string())),
            Err(_) => {
                #[cfg(unix)]
                {
                    use nix::sys::signal::{killpg, Signal};
                    use nix::unistd::Pid;
                    let _ = killpg(Pid::from_raw(pid as i32), Signal::SIGKILL);
                }
                #[cfg(not(unix))]
                {
                    let pid_text = pid.to_string();
                    let _ = tokio::process::Command::new("taskkill")
                        .args(["/PID", &pid_text, "/T", "/F"])
                        .status()
                        .await;
                }
                let _ = child.kill().await;
                let _ = child.wait().await;
                (
                    None,
                    Some(format!(
                        "Agent run exceeded its {} minute timeout",
                        execution_timeout_minutes
                    )),
                )
            }
        };
        let raw_stdout = match stdout_task {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        let stdout = normalize_agent_output(&event_runtime, &raw_stdout);
        let stderr = match stderr_task {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        let event = match status {
            Some(status) => {
                let succeeded = status.success();
                NativeRunEvent {
                    run_id: event_run_id,
                    event_type: if succeeded { "completed" } else { "failed" }.to_string(),
                    output: (!stdout.is_empty()).then_some(stdout),
                    error: (!succeeded && !stderr.is_empty()).then_some(stderr),
                    exit_code: status.code(),
                }
            }
            None => NativeRunEvent {
                run_id: event_run_id,
                event_type: "failed".to_string(),
                output: (!stdout.is_empty()).then_some(stdout.clone()),
                error: Some(wait_error.unwrap_or_else(|| {
                    if stderr.is_empty() {
                        "Agent process failed".into()
                    } else {
                        stderr
                    }
                })),
                exit_code: None,
            },
        };
        let _ = app.emit("agent-run-event", event);
    });
    Ok(CommandResponse::ok(NativeRunStartDTO {
        pid,
        runtime,
        process_started_at,
    }))
}

fn normalize_agent_output(runtime: &str, output: &str) -> String {
    if runtime != "claude-code" && !runtime.starts_with("ollama-claude:") {
        return output.to_string();
    }
    let mut fallback = String::new();
    for line in output.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if value.get("type").and_then(|value| value.as_str()) == Some("result") {
            if let Some(result) = value.get("result").and_then(|value| value.as_str()) {
                return result.to_string();
            }
        }
        if let Some(content) = value
            .pointer("/message/content")
            .and_then(|value| value.as_array())
        {
            for block in content {
                if let Some(text) = block.get("text").and_then(|value| value.as_str()) {
                    fallback.push_str(text);
                    fallback.push('\n');
                }
            }
        }
    }
    if fallback.trim().is_empty() {
        output.to_string()
    } else {
        fallback.trim().to_string()
    }
}

#[tauri::command]
pub fn cmd_agent_run_stop(
    pid: u32,
    expected_process_started_at: Option<u64>,
) -> Result<CommandResponse<bool>, String> {
    if !process_identity_matches(pid, expected_process_started_at) {
        return Ok(CommandResponse::err(format!(
            "Process {} is no longer the agent process Control launched",
            pid
        )));
    }
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, killpg, Signal};
        use nix::unistd::Pid;
        let target = Pid::from_raw(pid as i32);
        match killpg(target, Signal::SIGKILL).or_else(|_| kill(target, Signal::SIGKILL)) {
            Ok(()) => Ok(CommandResponse::ok(true)),
            Err(error) => Ok(CommandResponse::err(format!(
                "Failed to stop process {}: {}",
                pid, error
            ))),
        }
    }
    #[cfg(not(unix))]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
        match status {
            Ok(status) if status.success() => Ok(CommandResponse::ok(true)),
            Ok(status) => Ok(CommandResponse::err(format!(
                "Failed to stop process {pid}: taskkill exited with {status}"
            ))),
            Err(error) => Ok(CommandResponse::err(format!(
                "Failed to stop process {pid}: {error}"
            ))),
        }
    }
}

#[tauri::command]
pub fn cmd_process_is_running(
    pid: u32,
    expected_process_started_at: Option<u64>,
) -> Result<CommandResponse<bool>, String> {
    if expected_process_started_at.is_some() {
        return Ok(CommandResponse::ok(process_identity_matches(
            pid,
            expected_process_started_at,
        )));
    }
    #[cfg(unix)]
    {
        use nix::sys::signal::kill;
        use nix::unistd::Pid;
        match kill(Pid::from_raw(pid as i32), None) {
            Ok(()) => Ok(CommandResponse::ok(true)),
            Err(nix::errno::Errno::ESRCH) => Ok(CommandResponse::ok(false)),
            Err(error) => Ok(CommandResponse::err(error.to_string())),
        }
    }
    #[cfg(not(unix))]
    {
        let system = sysinfo::System::new_all();
        Ok(CommandResponse::ok(
            system.process(sysinfo::Pid::from_u32(pid)).is_some(),
        ))
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAvailabilityDTO {
    id: String,
    available: bool,
    path: Option<String>,
    model: Option<String>,
}

fn runtime_available(id: &str) -> bool {
    match id {
        "claude-code" | "claude" => which::which("claude")
            .ok()
            .and_then(|binary| {
                std::process::Command::new(binary)
                    .args(["auth", "status", "--json"])
                    .output()
                    .ok()
            })
            .map(|output| {
                output.status.success()
                    && serde_json::from_slice::<serde_json::Value>(&output.stdout)
                        .ok()
                        .and_then(|value| value.get("loggedIn").and_then(|value| value.as_bool()))
                        .unwrap_or(false)
            })
            .unwrap_or(false),
        "codex" => which::which("codex")
            .ok()
            .and_then(|binary| {
                std::process::Command::new(binary)
                    .args(["login", "status"])
                    .output()
                    .ok()
            })
            .map(|output| output.status.success())
            .unwrap_or(false),
        "opencode" => which::which("opencode").is_ok(),
        "ollama" => which::which("ollama").is_ok() && ollama_model("ollama").is_some(),
        _ => false,
    }
}

#[tauri::command]
pub fn cmd_runtime_availability() -> Result<CommandResponse<Vec<RuntimeAvailabilityDTO>>, String> {
    let runtimes = [
        ("claude-code", "claude"),
        ("codex", "codex"),
        ("opencode", "opencode"),
        ("ollama", "ollama"),
    ]
    .into_iter()
    .map(|(id, binary)| {
        let found = which::which(binary).ok();
        RuntimeAvailabilityDTO {
            id: id.into(),
            available: runtime_available(id),
            path: found.map(|path| path.to_string_lossy().to_string()),
            model: (id == "ollama").then(|| ollama_model("ollama")).flatten(),
        }
    })
    .collect();
    Ok(CommandResponse::ok(runtimes))
}

// ─── Agent Commands ─────────────────────────────────────────────────

#[cfg(test)]
mod terminal_tests {
    use super::{
        detect_test_command, first_ollama_model, open_terminal_process, process_identity_matches,
        process_started_at, runtime_supports_policy, valid_agent_timeout,
        validate_feltdb_server_url,
    };
    use std::io::{Read, Write};

    #[test]
    fn detects_project_test_commands() {
        let root =
            std::env::temp_dir().join(format!("control-test-detection-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create test fixture");
        std::fs::write(
            root.join("package.json"),
            r#"{"scripts":{"test":"vitest"}}"#,
        )
        .expect("write package");
        std::fs::write(root.join("pnpm-lock.yaml"), "").expect("write lockfile");
        assert_eq!(detect_test_command(&root).as_deref(), Some("pnpm test"));
        std::fs::remove_file(root.join("package.json")).expect("remove package");
        std::fs::remove_file(root.join("pnpm-lock.yaml")).expect("remove lockfile");
        std::fs::write(
            root.join("Cargo.toml"),
            "[package]\nname='fixture'\nversion='0.1.0'\n",
        )
        .expect("write manifest");
        assert_eq!(detect_test_command(&root).as_deref(), Some("cargo test"));
        std::fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn runtime_policies_are_fail_closed() {
        assert!(runtime_supports_policy(
            "codex",
            "workspace-write",
            true,
            false
        ));
        assert!(runtime_supports_policy(
            "claude-code",
            "read-only",
            false,
            false
        ));
        assert!(runtime_supports_policy(
            "opencode",
            "workspace-write",
            true,
            true
        ));
        assert!(runtime_supports_policy("ollama", "read-only", false, false));
        assert!(!runtime_supports_policy(
            "claude-code",
            "workspace-write",
            true,
            false
        ));
        assert!(!runtime_supports_policy(
            "codex",
            "workspace-write",
            true,
            true
        ));
        assert!(!runtime_supports_policy(
            "opencode",
            "read-only",
            false,
            false
        ));
        assert!(!runtime_supports_policy(
            "ollama",
            "workspace-write",
            true,
            false
        ));
        assert_eq!(
            first_ollama_model("NAME ID SIZE\nqwen2.5-coder:14b abc 9GB\nllama3:8b def 5GB"),
            Some("qwen2.5-coder:14b".into())
        );
        assert!(!runtime_supports_policy(
            "unknown",
            "workspace-write",
            true,
            true
        ));
    }

    #[test]
    fn agent_timeouts_are_bounded() {
        assert!(!valid_agent_timeout(0));
        assert!(valid_agent_timeout(1));
        assert!(valid_agent_timeout(240));
        assert!(!valid_agent_timeout(241));
    }

    #[test]
    fn process_identity_rejects_pid_reuse() {
        let pid = std::process::id();
        let started_at = process_started_at(pid).expect("current process identity");
        assert!(process_identity_matches(pid, Some(started_at)));
        assert!(!process_identity_matches(pid, Some(started_at + 1)));
    }

    #[cfg(unix)]
    #[test]
    fn agent_stop_terminates_the_launched_process_group() {
        use std::os::unix::process::CommandExt;
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "sleep 30 & wait"]);
        command.process_group(0);
        let mut child = command.spawn().expect("spawn process group");
        let pid = child.id();
        let started_at = (0..20)
            .find_map(|_| {
                let identity = process_started_at(pid);
                if identity.is_none() {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                identity
            })
            .expect("process identity");
        super::cmd_agent_run_stop(pid, Some(started_at)).expect("stop command");
        let status = child.wait().expect("reap stopped process");
        assert!(!status.success());
        assert!(!process_identity_matches(pid, Some(started_at)));
    }

    #[test]
    fn remote_data_urls_require_secure_transport() {
        assert_eq!(
            validate_feltdb_server_url("https://db.example.test/").unwrap(),
            "https://db.example.test"
        );
        assert!(validate_feltdb_server_url("http://localhost:8080").is_ok());
        assert!(validate_feltdb_server_url("http://127.0.0.1:8080").is_ok());
        assert!(validate_feltdb_server_url("http://db.example.test").is_err());
        assert!(validate_feltdb_server_url("file:///tmp/db").is_err());
    }

    #[test]
    fn interactive_terminal_preserves_changed_directory() {
        let root = std::env::temp_dir().join(format!("control-pty-{}", uuid::Uuid::new_v4()));
        let nested = root.join("nested");
        std::fs::create_dir_all(&nested).expect("create terminal fixture");
        let canonical_root = root.canonicalize().expect("canonical fixture root");
        let canonical_nested = nested.canonicalize().expect("canonical nested fixture");

        let (_pid, mut child, mut reader, mut writer, master) =
            open_terminal_process(&nested).expect("open PTY terminal");
        master
            .resize(portable_pty::PtySize {
                rows: 42,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("resize PTY");
        let resized = master.get_size().expect("read PTY size");
        assert_eq!((resized.rows, resized.cols), (42, 120));
        let mut killer = child.clone_killer();
        let output_thread = std::thread::spawn(move || {
            let mut output = String::new();
            reader
                .read_to_string(&mut output)
                .expect("read terminal output");
            output
        });
        #[cfg(unix)]
        let commands=b"printf '__CONTROL_PWD1__%s\\n' \"$PWD\"\rprintf '__CONTROL_TERM__%s\\n' \"$TERM\"\rcd ..\rprintf '__CONTROL_PWD2__%s\\n' \"$PWD\"\rexit\r".as_slice();
        #[cfg(windows)]
        let commands=b"echo __CONTROL_PWD1__%CD%\recho __CONTROL_TERM__%TERM%\rcd ..\recho __CONTROL_PWD2__%CD%\rexit\r".as_slice();
        writer.write_all(commands).expect("write terminal commands");
        writer.flush().expect("flush terminal commands");
        drop(writer);
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = sender.send(child.wait());
        });
        let status = match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(result) => result.expect("wait for terminal shell"),
            Err(_) => {
                let _ = killer.kill();
                receiver
                    .recv_timeout(std::time::Duration::from_secs(2))
                    .expect("terminal did not stop")
                    .expect("wait after stop")
            }
        };
        let output = output_thread.join().expect("join terminal output");

        assert!(status.success(), "shell failed: {output}");
        assert!(
            output.contains(&format!("__CONTROL_PWD1__{}", canonical_nested.display())),
            "initial cwd missing: {output}"
        );
        assert!(
            output.contains("__CONTROL_TERM__xterm-256color"),
            "interactive TERM missing: {output}"
        );
        assert!(
            output.contains(&format!("__CONTROL_PWD2__{}", canonical_root.display())),
            "changed cwd missing: {output}"
        );
        std::fs::remove_dir_all(&root).expect("remove terminal fixture");
    }

    #[test]
    fn interactive_terminal_interrupt_keeps_shell_alive() {
        let root =
            std::env::temp_dir().join(format!("control-pty-interrupt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create interrupt fixture");
        let (_pid, mut child, mut reader, mut writer, _master) =
            open_terminal_process(&root).expect("open PTY terminal");
        let mut killer = child.clone_killer();
        let output_thread = std::thread::spawn(move || {
            let mut output = String::new();
            reader
                .read_to_string(&mut output)
                .expect("read terminal output");
            output
        });
        #[cfg(unix)]
        let long_command = b"sleep 10\r".as_slice();
        #[cfg(windows)]
        let long_command = b"ping -n 10 127.0.0.1 >NUL\r".as_slice();
        writer.write_all(long_command).expect("start long command");
        writer.flush().expect("flush command");
        std::thread::sleep(std::time::Duration::from_millis(250));
        #[cfg(unix)]
        let after_interrupt = b"\x03printf '__CONTROL_AFTER_INTERRUPT__\\n'\rexit\r".as_slice();
        #[cfg(windows)]
        let after_interrupt = b"\x03echo __CONTROL_AFTER_INTERRUPT__\rexit\r".as_slice();
        writer
            .write_all(after_interrupt)
            .expect("interrupt command");
        writer.flush().expect("flush interrupt");
        drop(writer);
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = sender.send(child.wait());
        });
        let status = match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(result) => result.expect("wait for terminal shell"),
            Err(_) => {
                let _ = killer.kill();
                receiver
                    .recv_timeout(std::time::Duration::from_secs(2))
                    .expect("terminal did not stop")
                    .expect("wait after stop")
            }
        };
        let output = output_thread.join().expect("join terminal output");
        assert!(status.success(), "shell failed after interrupt: {output}");
        assert!(
            output.contains("__CONTROL_AFTER_INTERRUPT__"),
            "shell did not survive Ctrl-C: {output}"
        );
        std::fs::remove_dir_all(root).expect("remove fixture");
    }

    #[tokio::test]
    async fn git_workflow_diffs_branches_and_publishes() {
        let root =
            std::env::temp_dir().join(format!("control-git-workflow-{}", uuid::Uuid::new_v4()));
        let workspace = root.join("workspace");
        let remote_path = root.join("remote.git");
        std::fs::create_dir_all(&root).expect("create Git fixture");
        git2::Repository::init_bare(&remote_path).expect("create bare remote");
        let repo = git2::Repository::init(&workspace).expect("create workspace repository");
        repo.config()
            .expect("config")
            .set_str("user.name", "Control Test")
            .expect("name");
        repo.config()
            .expect("config")
            .set_str("user.email", "control@example.test")
            .expect("email");
        repo.remote("origin", remote_path.to_str().expect("remote path"))
            .expect("add origin");
        std::fs::write(workspace.join("README.md"), "first\n").expect("write initial file");
        control::git::GitManager::stage_file(&workspace, "README.md").expect("stage initial file");
        control::git::GitManager::commit(&workspace, "Initial commit").expect("initial commit");

        std::fs::write(workspace.join("README.md"), "first\nsecond\n")
            .expect("modify tracked file");
        let diff = super::cmd_git_diff(
            workspace.to_string_lossy().to_string(),
            "README.md".into(),
            false,
        )
        .expect("diff response");
        assert!(diff.success && diff.data.unwrap_or_default().contains("+second"));
        std::fs::write(workspace.join("new-file.txt"), "brand new\n")
            .expect("write untracked file");
        let untracked = super::cmd_git_diff(
            workspace.to_string_lossy().to_string(),
            "new-file.txt".into(),
            false,
        )
        .expect("untracked diff response");
        assert!(untracked.success && untracked.data.unwrap_or_default().contains("+brand new"));
        let escaped = super::cmd_git_diff(
            workspace.to_string_lossy().to_string(),
            "../outside.txt".into(),
            false,
        )
        .expect("escaped diff response");
        assert!(!escaped.success);
        std::fs::remove_file(workspace.join("new-file.txt")).expect("remove untracked file");
        control::git::GitManager::stage_file(&workspace, "README.md").expect("stage modification");
        let staged = super::cmd_git_diff(
            workspace.to_string_lossy().to_string(),
            "README.md".into(),
            true,
        )
        .expect("staged diff response");
        assert!(staged.success && staged.data.unwrap_or_default().contains("+second"));
        control::git::GitManager::commit(&workspace, "Second commit").expect("second commit");

        let switched = super::cmd_git_switch_branch(
            workspace.to_string_lossy().to_string(),
            "feature/control".into(),
            true,
        )
        .expect("branch response");
        assert!(
            switched.success,
            "branch creation failed: {:?}",
            switched.error
        );
        let branches = super::cmd_git_branches(workspace.to_string_lossy().to_string())
            .expect("branches response");
        assert!(branches
            .data
            .unwrap_or_default()
            .contains(&"feature/control".to_string()));
        let pushed = super::cmd_git_sync(workspace.to_string_lossy().to_string(), "push".into())
            .await
            .expect("push response");
        assert!(pushed.success, "push failed: {:?}", pushed.error);
        assert!(repo
            .find_branch("feature/control", git2::BranchType::Local)
            .is_ok());
        assert!(git2::Repository::open_bare(&remote_path)
            .expect("open remote")
            .find_reference("refs/heads/feature/control")
            .is_ok());
        std::fs::remove_dir_all(&root).expect("remove Git fixture");
    }
}

// ─── Coordination Commands ────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_agent_chat(
    app: AppHandle,
    run_id: String,
    project_path: String,
    project_name: String,
    agent_name: String,
    agent_instructions: String,
    history: String,
    content: String,
    preferred_runtime: Option<String>,
    execution_timeout_minutes: u32,
) -> Result<CommandResponse<NativeRunStartDTO>, String> {
    if content.trim().is_empty() {
        return Ok(CommandResponse::err("Message cannot be empty".to_string()));
    }
    let workspace = match std::path::Path::new(&project_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => {
            return Ok(CommandResponse::err(
                "Project workspace is unavailable".to_string(),
            ))
        }
    };
    if !valid_agent_timeout(execution_timeout_minutes) {
        return Ok(CommandResponse::err(
            "Conversation timeout must be between 1 and 240 minutes".to_string(),
        ));
    }
    let prompt = format!(
        "You are the {} agent inside Control.\n\nRole instructions:\n{}\n\nProject: {}\nWorkspace: {}\n\nRecent conversation:\n{}\n\nUser: {}\n\nRespond directly and concretely. Use read-only project inspection tools when the selected runtime provides them; never claim to have inspected files otherwise, and do not modify files in conversation mode.",
        agent_name,
        agent_instructions,
        project_name,
        workspace.display(),
        history,
        content
    );
    let preferred = preferred_runtime.as_deref().unwrap_or("auto");
    let (runtime, mut command) = if (preferred == "ollama"
        || preferred.starts_with("ollama:")
        || preferred == "local"
        || (preferred == "auto" && runtime_available("ollama")))
        && runtime_available("ollama")
    {
        let binary = which::which("ollama").expect("runtime checked");
        let model = ollama_model(preferred).expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        command
            .arg("run")
            .arg(&model)
            .args(["--hidethinking", "--nowordwrap"])
            .arg(&prompt);
        (format!("ollama:{model}"), command)
    } else if matches!(preferred, "auto" | "frontier" | "claude" | "claude-code")
        && runtime_available("claude-code")
    {
        let binary = which::which("claude").expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        command
            .arg("-p")
            .arg(&prompt)
            .arg("--no-session-persistence")
            .arg("--output-format")
            .arg("text")
            .arg("--allowedTools")
            .args(["Read", "Glob", "Grep"]);
        ("claude-code".to_string(), command)
    } else if matches!(preferred, "auto" | "frontier" | "codex") && runtime_available("codex") {
        let binary = which::which("codex").expect("runtime checked");
        let mut command = tokio::process::Command::new(binary);
        command
            .arg("exec")
            .args(["--sandbox", "read-only", "--ephemeral"])
            .arg(&prompt);
        ("codex".to_string(), command)
    } else {
        return Ok(CommandResponse::err(format!("Configured conversational runtime '{}' is unavailable or cannot enforce read-only chat",preferred)));
    };
    #[cfg(unix)]
    command.process_group(0);
    command
        .current_dir(workspace)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "Failed to run {}: {}",
                runtime, error
            )))
        }
    };
    let pid = child.id().unwrap_or(0);
    let process_started_at = process_started_at(pid).unwrap_or_default();
    if process_started_at == 0 {
        let _ = child.kill().await;
        return Ok(CommandResponse::err(
            "Could not establish a durable identity for the conversation process".into(),
        ));
    }
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let event_run_id = run_id.clone();
    let event_runtime = runtime.to_string();
    let stream = |mut reader: Box<dyn AsyncRead + Unpin + Send>, app: AppHandle, run_id: String| {
        tauri::async_runtime::spawn(async move {
            let mut all = Vec::new();
            let mut buffer = vec![0_u8; 4096];
            loop {
                match reader.read(&mut buffer).await {
                    Ok(0) => break,
                    Ok(count) => {
                        all.extend_from_slice(&buffer[..count]);
                        let _ = app.emit(
                            "agent-chat-event",
                            NativeRunEvent {
                                run_id: run_id.clone(),
                                event_type: "output".into(),
                                output: Some(String::from_utf8_lossy(&buffer[..count]).to_string()),
                                error: None,
                                exit_code: None,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            String::from_utf8_lossy(&all).trim().to_string()
        })
    };
    let stdout_task = stdout.map(|reader| stream(Box::new(reader), app.clone(), run_id.clone()));
    let stderr_task = stderr.map(|reader| stream(Box::new(reader), app.clone(), run_id.clone()));
    tauri::async_runtime::spawn(async move {
        let timeout = std::time::Duration::from_secs(u64::from(execution_timeout_minutes) * 60);
        let wait = tokio::time::timeout(timeout, child.wait()).await;
        let (status, wait_error) = match wait {
            Ok(Ok(status)) => (Some(status), None),
            Ok(Err(error)) => (None, Some(error.to_string())),
            Err(_) => {
                #[cfg(unix)]
                {
                    let _ = nix::sys::signal::killpg(
                        nix::unistd::Pid::from_raw(pid as i32),
                        nix::sys::signal::Signal::SIGKILL,
                    );
                }
                #[cfg(not(unix))]
                {
                    let pid_text = pid.to_string();
                    let _ = tokio::process::Command::new("taskkill")
                        .args(["/PID", &pid_text, "/T", "/F"])
                        .status()
                        .await;
                }
                let _ = child.kill().await;
                let _ = child.wait().await;
                (
                    None,
                    Some(format!(
                        "{} did not respond within {} minutes",
                        event_runtime, execution_timeout_minutes
                    )),
                )
            }
        };
        let raw_stdout = match stdout_task {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        let stdout = normalize_agent_output(&event_runtime, &raw_stdout);
        let stderr = match stderr_task {
            Some(task) => task.await.unwrap_or_default(),
            None => String::new(),
        };
        let event = match status {
            Some(status) if status.success() && !stdout.is_empty() => NativeRunEvent {
                run_id: event_run_id,
                event_type: "completed".into(),
                output: Some(stdout),
                error: None,
                exit_code: status.code(),
            },
            Some(status) => NativeRunEvent {
                run_id: event_run_id,
                event_type: "failed".into(),
                output: (!stdout.is_empty()).then_some(stdout.clone()),
                error: Some(if stderr.is_empty() {
                    if status.success() {
                        format!("{} returned an empty response", event_runtime)
                    } else if !stdout.is_empty() {
                        stdout.clone()
                    } else if !raw_stdout.trim().is_empty() {
                        raw_stdout.trim().to_string()
                    } else {
                        format!("{} exited with {}", event_runtime, status)
                    }
                } else {
                    stderr
                }),
                exit_code: status.code(),
            },
            None => NativeRunEvent {
                run_id: event_run_id,
                event_type: "failed".into(),
                output: (!stdout.is_empty()).then_some(stdout),
                error: Some(wait_error.unwrap_or_else(|| {
                    if stderr.is_empty() {
                        "Conversation process failed".into()
                    } else {
                        stderr
                    }
                })),
                exit_code: None,
            },
        };
        let _ = app.emit("agent-chat-event", event);
    });
    Ok(CommandResponse::ok(NativeRunStartDTO {
        pid,
        runtime: runtime.to_string(),
        process_started_at,
    }))
}

// ─── Workspace Commands ─────────────────────────────────────────────

// ─── DTOs (Data Transfer Objects) ────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectDTO {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub runtime: Option<String>,
}

// ─── Workbench Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn cmd_git_status(
    workspace_path: String,
) -> Result<CommandResponse<GitStatusDTO>, String> {
    match control::git::GitManager::status(&workspace_path) {
        Ok(status) => {
            let files = status
                .files
                .into_iter()
                .map(|(_, file_status)| GitFileStatusDTO {
                    path: file_status.path,
                    status: file_status.status,
                    staged_status: file_status.staged_status,
                    has_worktree_changes: file_status.has_worktree_changes,
                })
                .collect();

            Ok(CommandResponse::ok(GitStatusDTO {
                branch: status.branch,
                ahead: status.ahead,
                behind: status.behind,
                is_clean: status.is_clean,
                files,
                staged: status.staged,
            }))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_explorer_tree(
    workspace_path: String,
    show_generated: bool,
) -> Result<CommandResponse<Vec<ExplorerNodeDTO>>, String> {
    let file_manager = control::file::FileManager::new(&workspace_path);
    match file_manager.build_tree(64, show_generated).await {
        Ok(tree) => {
            let dto_tree: Vec<ExplorerNodeDTO> = tree
                .into_iter()
                .map(|node| ExplorerNodeDTO::from_tree_node(node))
                .collect();
            Ok(CommandResponse::ok(dto_tree))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_file_save(
    workspace_path: String,
    file_path: String,
    content: String,
) -> Result<CommandResponse<bool>, String> {
    let file_manager = control::file::FileManager::new(&workspace_path);
    match file_manager.write(&file_path, &content).await {
        Ok(_) => Ok(CommandResponse::ok(true)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_file_read(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<String>, String> {
    let file_manager = control::file::FileManager::new(&workspace_path);
    match file_manager.read(&file_path).await {
        Ok(content) => Ok(CommandResponse::ok(content)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

fn safe_workspace_path(
    workspace_path: &str,
    relative_path: &str,
) -> Result<std::path::PathBuf, String> {
    let relative = std::path::Path::new(relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Only workspace-relative paths are allowed".to_string());
    }
    let root = std::path::Path::new(workspace_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let candidate = root.join(relative);
    let boundary = candidate
        .parent()
        .unwrap_or(&candidate)
        .canonicalize()
        .unwrap_or_else(|_| root.clone());
    if !boundary.starts_with(&root) {
        return Err("Path escapes workspace boundary".to_string());
    }
    Ok(candidate)
}

#[tauri::command]
pub fn cmd_file_create(
    workspace_path: String,
    file_path: String,
    is_directory: bool,
) -> Result<CommandResponse<bool>, String> {
    let path = match safe_workspace_path(&workspace_path, &file_path) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    let result = if is_directory {
        std::fs::create_dir_all(&path)
    } else {
        if let Some(parent) = path.parent() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                return Ok(CommandResponse::err(error.to_string()));
            }
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map(|_| ())
    };
    match result {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

#[tauri::command]
pub fn cmd_file_rename(
    workspace_path: String,
    file_path: String,
    new_path: String,
) -> Result<CommandResponse<bool>, String> {
    let from = match safe_workspace_path(&workspace_path, &file_path) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    let to = match safe_workspace_path(&workspace_path, &new_path) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if let Some(parent) = to.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return Ok(CommandResponse::err(error.to_string()));
        }
    }
    match std::fs::rename(from, to) {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

#[tauri::command]
pub fn cmd_file_delete(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<bool>, String> {
    let path = match safe_workspace_path(&workspace_path, &file_path) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    if [".git", ".control"]
        .iter()
        .any(|protected| path.ends_with(protected))
    {
        return Ok(CommandResponse::err(
            "Protected project metadata cannot be deleted".to_string(),
        ));
    }
    let result = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    match result {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

// ─── DTOs for Workbench ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStatusDTO {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub is_clean: bool,
    pub files: Vec<GitFileStatusDTO>,
    pub staged: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatusDTO {
    pub path: String,
    pub status: String,
    pub staged_status: Option<String>,
    pub has_worktree_changes: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictDTO {
    pub path: String,
    pub kind: String,
    pub explanation: String,
    pub local_exists: bool,
    pub incoming_exists: bool,
    pub local_preview: String,
    pub incoming_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplorerNodeDTO {
    pub id: String,
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Option<Vec<ExplorerNodeDTO>>,
}

impl ExplorerNodeDTO {
    pub fn from_tree_node(node: control::file::TreeNode) -> Self {
        let node_type = if node.is_dir { "folder" } else { "file" }.to_string();
        let children = node.children.map(|children| {
            children
                .into_iter()
                .map(ExplorerNodeDTO::from_tree_node)
                .collect()
        });

        Self {
            id: node.id,
            path: node.path,
            name: node.name,
            node_type,
            children,
        }
    }
}

// ─── Git Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_git_stage(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<bool>, String> {
    match control::git::GitManager::stage_file(&workspace_path, &file_path) {
        Ok(_) => Ok(CommandResponse::ok(true)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_git_commit(
    workspace_path: String,
    message: String,
) -> Result<CommandResponse<String>, String> {
    match control::git::GitManager::commit(&workspace_path, &message) {
        Ok(commit_id) => Ok(CommandResponse::ok(commit_id)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub fn cmd_git_diff(
    workspace_path: String,
    file_path: String,
    staged: bool,
) -> Result<CommandResponse<String>, String> {
    let workspace = match std::path::Path::new(&workspace_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => return Ok(CommandResponse::err("Git workspace is unavailable".into())),
    };
    let candidate = match safe_workspace_path(&workspace.to_string_lossy(), &file_path) {
        Ok(path) => path,
        Err(error) => return Ok(CommandResponse::err(error)),
    };
    let mut command = std::process::Command::new("git");
    command.arg("-C").arg(&workspace).arg("diff");
    if staged {
        command.arg("--cached");
    }
    let output = command.arg("--").arg(&file_path).output();
    match output {
        Ok(output) if output.status.success() => {
            let patch = String::from_utf8_lossy(&output.stdout).to_string();
            let tracked = std::process::Command::new("git")
                .arg("-C")
                .arg(&workspace)
                .args(["ls-files", "--error-unmatch", "--"])
                .arg(&file_path)
                .output()
                .map(|result| result.status.success())
                .unwrap_or(true);
            if patch.is_empty() && !staged && !tracked && candidate.is_file() {
                let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
                match std::process::Command::new("git")
                    .arg("-C")
                    .arg(&workspace)
                    .args(["diff", "--no-index", "--"])
                    .arg(null_device)
                    .arg(&candidate)
                    .output()
                {
                    Ok(untracked)
                        if untracked.status.success() || untracked.status.code() == Some(1) =>
                    {
                        Ok(CommandResponse::ok(
                            String::from_utf8_lossy(&untracked.stdout).to_string(),
                        ))
                    }
                    Ok(untracked) => Ok(CommandResponse::err(
                        String::from_utf8_lossy(&untracked.stderr)
                            .trim()
                            .to_string(),
                    )),
                    Err(error) => Ok(CommandResponse::err(error.to_string())),
                }
            } else {
                Ok(CommandResponse::ok(patch))
            }
        }
        Ok(output) => Ok(CommandResponse::err(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        )),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

#[tauri::command]
pub fn cmd_git_file_content(workspace_path:String,file_path:String,version:String)->Result<CommandResponse<String>,String>{
    let relative=std::path::Path::new(&file_path);
    if relative.is_absolute()||relative.components().any(|part|!matches!(part,std::path::Component::Normal(_))){return Ok(CommandResponse::err("Git file path must stay inside the workspace".into()));}
    let workspace=match std::path::Path::new(&workspace_path).canonicalize(){Ok(path)if path.is_dir()=>path,_=>return Ok(CommandResponse::err("Git workspace is unavailable".into()))};
    if version=="before"{let spec=format!("HEAD:{}",relative.to_string_lossy());return match std::process::Command::new("git").arg("-C").arg(&workspace).args(["show",&spec]).output(){Ok(output)if output.status.success()=>Ok(CommandResponse::ok(String::from_utf8_lossy(&output.stdout).to_string())),Ok(output)if output.status.code()==Some(128)=>Ok(CommandResponse::ok(String::new())),Ok(output)=>Ok(CommandResponse::err(String::from_utf8_lossy(&output.stderr).trim().to_string())),Err(error)=>Ok(CommandResponse::err(error.to_string()))};}
    if version!="now"{return Ok(CommandResponse::err("Unsupported Git file version".into()));}
    let candidate=workspace.join(relative);if !candidate.exists(){return Ok(CommandResponse::ok(String::new()));}let canonical=match candidate.canonicalize(){Ok(path)if path.starts_with(&workspace)=>path,_=>return Ok(CommandResponse::err("Git file path escapes the workspace".into()))};
    match std::fs::read(&canonical){Ok(bytes)=>Ok(CommandResponse::ok(String::from_utf8_lossy(&bytes).to_string())),Err(error)=>Ok(CommandResponse::err(error.to_string()))}
}

#[tauri::command]
pub fn cmd_git_unstage(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<bool>, String> {
    let has_head = std::process::Command::new("git")
        .arg("-C")
        .arg(&workspace_path)
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    let mut command = std::process::Command::new("git");
    command.arg("-C").arg(&workspace_path);
    if has_head {
        command.args(["reset", "HEAD", "--"]);
    } else {
        command.args(["rm", "--cached", "--"]);
    }
    let output = command.arg(&file_path).output();
    match output {
        Ok(output) if output.status.success() => Ok(CommandResponse::ok(true)),
        Ok(output) => Ok(CommandResponse::err(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        )),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

#[tauri::command]
pub fn cmd_git_history(
    workspace_path: String,
) -> Result<CommandResponse<Vec<CommitInfoDTO>>, String> {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(&workspace_path)
        .args(["log", "-25", "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%at"])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            let commits = String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    let mut fields = line.split('\u{1f}');
                    Some(CommitInfoDTO {
                        hash: fields.next()?.into(),
                        short_hash: fields.next()?.into(),
                        message: fields.next()?.into(),
                        author: fields.next()?.into(),
                        timestamp: fields.next()?.parse().ok()?,
                    })
                })
                .collect();
            Ok(CommandResponse::ok(commits))
        }
        Ok(output) => Ok(CommandResponse::err(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        )),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

fn git_command(workspace_path: &str, args: &[&str]) -> CommandResponse<String> {
    match std::process::Command::new("git")
        .arg("-C")
        .arg(workspace_path)
        .args(args)
        .output()
    {
        Ok(output) if output.status.success() => {
            CommandResponse::ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        Ok(output) => {
            CommandResponse::err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
        Err(error) => CommandResponse::err(error.to_string()),
    }
}

#[tauri::command]
pub async fn cmd_git_sync(
    workspace_path: String,
    action: String,
) -> Result<CommandResponse<String>, String> {
    if !matches!(action.as_str(), "fetch" | "pull" | "push") {
        return Ok(CommandResponse::err("Unsupported Git action".into()));
    }
    let workspace = match std::path::Path::new(&workspace_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => return Ok(CommandResponse::err("Git workspace is unavailable".into())),
    };
    let mut command = tokio::process::Command::new("git");
    command.arg("-C").arg(&workspace);
    if action == "push" {
        let has_upstream = std::process::Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args([
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        if has_upstream {
            command.arg("push");
        } else {
            command.args(["push", "--set-upstream", "origin", "HEAD"]);
        }
    } else {
        command.arg(&action);
    }
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    match tokio::time::timeout(std::time::Duration::from_secs(300), command.output()).await {
        Ok(Ok(output)) if output.status.success() => Ok(CommandResponse::ok(
            String::from_utf8_lossy(&output.stdout).trim().to_string(),
        )),
        Ok(Ok(output)) => Ok(CommandResponse::err(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        )),
        Ok(Err(error)) => Ok(CommandResponse::err(error.to_string())),
        Err(_) => Ok(CommandResponse::err(format!(
            "Git {action} timed out after 5 minutes"
        ))),
    }
}

fn git_conflict_stage(workspace: &std::path::Path, stage: u8, path: &str) -> Option<Vec<u8>> {
    let spec = format!(":{stage}:{path}");
    std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(["show", &spec])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| output.stdout)
}

#[tauri::command]
pub fn cmd_git_conflicts(workspace_path: String) -> Result<CommandResponse<Vec<GitConflictDTO>>, String> {
    let workspace = match std::path::Path::new(&workspace_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => return Ok(CommandResponse::err("Git workspace is unavailable".into())),
    };
    let output = match std::process::Command::new("git").arg("-C").arg(&workspace).args(["diff", "--name-only", "--diff-filter=U", "-z"]).output() {
        Ok(output) if output.status.success() => output,
        Ok(output) => return Ok(CommandResponse::err(String::from_utf8_lossy(&output.stderr).trim().to_string())),
        Err(error) => return Ok(CommandResponse::err(error.to_string())),
    };
    let conflicts = output.stdout.split(|byte| *byte == 0).filter(|path| !path.is_empty()).map(|raw_path| {
        let path = String::from_utf8_lossy(raw_path).to_string();
        let local = git_conflict_stage(&workspace, 2, &path);
        let incoming = git_conflict_stage(&workspace, 3, &path);
        let (kind, explanation) = match (local.is_some(), incoming.is_some()) {
            (true, true) => ("both-modified", "Both your branch and the incoming branch changed this file. Review the competing versions or explicitly choose one."),
            (true, false) => ("incoming-deleted", "Your branch changed this file, but the incoming branch deleted it. Keep your file or accept the deletion."),
            (false, true) => ("local-deleted", "Your branch deleted this file, but the incoming branch changed it. Keep the deletion or restore the incoming file."),
            (false, false) => ("both-deleted", "Both branches deleted this file. It can be resolved automatically."),
        };
        let preview = |content: &Option<Vec<u8>>| content.as_ref().map(|bytes| String::from_utf8_lossy(bytes).lines().take(12).collect::<Vec<_>>().join("\n")).unwrap_or_default();
        GitConflictDTO { path, kind: kind.into(), explanation: explanation.into(), local_exists: local.is_some(), incoming_exists: incoming.is_some(), local_preview: preview(&local), incoming_preview: preview(&incoming) }
    }).collect();
    Ok(CommandResponse::ok(conflicts))
}

#[tauri::command]
pub fn cmd_git_resolve_conflict(workspace_path: String, file_path: String, resolution: String) -> Result<CommandResponse<bool>, String> {
    let workspace = match std::path::Path::new(&workspace_path).canonicalize() { Ok(path) if path.is_dir() => path, _ => return Ok(CommandResponse::err("Git workspace is unavailable".into())) };
    let relative = std::path::Path::new(&file_path);
    if relative.is_absolute() || relative.components().any(|part| !matches!(part, std::path::Component::Normal(_))) { return Ok(CommandResponse::err("Conflict path must stay inside the workspace".into())); }
    let stage = match resolution.as_str() { "local" => 2, "incoming" => 3, "resolved" => 0, _ => return Ok(CommandResponse::err("Unsupported conflict resolution".into())) };
    if stage == 0 {
        if let Ok(content) = std::fs::read_to_string(workspace.join(relative)) {
            if content.contains("<<<<<<<") || content.contains("=======") || content.contains(">>>>>>>") {
                return Ok(CommandResponse::err("Conflict markers remain in this file. Edit every marked section before marking it resolved.".into()));
            }
        }
    }
    if stage != 0 {
        let content = git_conflict_stage(&workspace, stage, &file_path);
        let operation = if let Some(content) = content {
            std::fs::write(workspace.join(relative), content).map_err(|error| error.to_string()).map(|_| ())
        } else {
            match std::fs::remove_file(workspace.join(relative)) { Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(error) => Err(error.to_string()) }
        };
        if let Err(error) = operation { return Ok(CommandResponse::err(error)); }
    }
    let output = std::process::Command::new("git").arg("-C").arg(&workspace).arg("add").arg("--").arg(relative).output();
    match output { Ok(output) if output.status.success() => Ok(CommandResponse::ok(true)), Ok(output) => Ok(CommandResponse::err(String::from_utf8_lossy(&output.stderr).trim().to_string())), Err(error) => Ok(CommandResponse::err(error.to_string())) }
}

#[tauri::command]
pub fn cmd_git_auto_resolve_conflicts(workspace_path: String) -> Result<CommandResponse<u32>, String> {
    let response = cmd_git_conflicts(workspace_path.clone())?;
    if !response.success { return Ok(CommandResponse::err(response.error.unwrap_or_else(|| "Could not inspect conflicts".into()))); }
    let mut resolved = 0;
    for conflict in response.data.unwrap_or_default() {
        let identical = conflict.local_exists && conflict.incoming_exists && git_conflict_stage(std::path::Path::new(&workspace_path), 2, &conflict.path) == git_conflict_stage(std::path::Path::new(&workspace_path), 3, &conflict.path);
        if conflict.kind == "both-deleted" || identical {
            let resolution = if identical { "local" } else { "resolved" };
            if cmd_git_resolve_conflict(workspace_path.clone(), conflict.path, resolution.into())?.success { resolved += 1; }
        }
    }
    Ok(CommandResponse::ok(resolved))
}

#[tauri::command]
pub fn cmd_git_branches(workspace_path: String) -> Result<CommandResponse<Vec<String>>, String> {
    let response = git_command(&workspace_path, &["branch", "--format=%(refname:short)"]);
    if !response.success {
        return Ok(CommandResponse::err(
            response
                .error
                .unwrap_or_else(|| "Unable to list branches".into()),
        ));
    }
    Ok(CommandResponse::ok(
        response
            .data
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .filter(|line| !line.is_empty())
            .collect(),
    ))
}

#[tauri::command]
pub fn cmd_git_switch_branch(
    workspace_path: String,
    branch: String,
    create: bool,
) -> Result<CommandResponse<String>, String> {
    if branch.trim().is_empty() || branch.starts_with('-') {
        return Ok(CommandResponse::err("Invalid branch name".into()));
    }
    let args = if create {
        vec!["switch", "--create", branch.as_str()]
    } else {
        vec!["switch", "--", branch.as_str()]
    };
    Ok(git_command(&workspace_path, &args))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfoDTO {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: u64,
}

// ─── Terminal Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn cmd_terminal_create_session(
    name: String,
    cwd: String,
) -> Result<CommandResponse<String>, String> {
    let manager = control::terminal::TerminalManager::new();
    match manager.create_session(name, cwd).await {
        Ok(session_id) => Ok(CommandResponse::ok(session_id)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_terminal_execute(
    session_id: String,
    command: String,
    cwd: String,
) -> Result<CommandResponse<String>, String> {
    let manager = control::terminal::TerminalManager::new();
    match manager.execute_command(&session_id, &command, &cwd).await {
        Ok(output) => Ok(CommandResponse::ok(output)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeTerminalEvent {
    session_id: String,
    event_type: String,
    output: Option<String>,
    exit_code: Option<i32>,
}

#[derive(Clone, Default)]
pub struct TerminalRegistry {
    sessions: Arc<tokio::sync::Mutex<HashMap<String, ManagedTerminal>>>,
}

impl Drop for TerminalRegistry {
    fn drop(&mut self) {
        if Arc::strong_count(&self.sessions) != 1 {
            return;
        }
        if let Ok(sessions) = self.sessions.try_lock() {
            for session in sessions.values() {
                #[cfg(unix)]
                {
                    let _ = nix::sys::signal::killpg(
                        nix::unistd::Pid::from_raw(session.pid as i32),
                        nix::sys::signal::Signal::SIGTERM,
                    );
                }
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/PID", &session.pid.to_string(), "/T", "/F"])
                        .status();
                }
            }
        }
    }
}

#[derive(Clone)]
struct ManagedTerminal {
    pid: u32,
    stdin: Arc<std::sync::Mutex<Box<dyn std::io::Write + Send>>>,
    master: Arc<std::sync::Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
}

type PtyChild = Box<dyn portable_pty::Child + Send + Sync>;
type PtyReader = Box<dyn std::io::Read + Send>;
type PtyWriter = Box<dyn std::io::Write + Send>;
type PtyMaster = Box<dyn portable_pty::MasterPty + Send>;

fn open_terminal_process(
    workspace: &std::path::Path,
) -> anyhow::Result<(u32, PtyChild, PtyReader, PtyWriter, PtyMaster)> {
    let pair = portable_pty::native_pty_system().openpty(portable_pty::PtySize {
        rows: 30,
        cols: 160,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    #[cfg(unix)]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
    let mut command = portable_pty::CommandBuilder::new(shell);
    #[cfg(unix)]
    command.arg("-l");
    command.cwd(workspace);
    command.env("TERM", "xterm-256color");
    command.env("PAGER", "cat");
    command.env("GIT_PAGER", "cat");
    let child = pair.slave.spawn_command(command)?;
    let pid = child.process_id().unwrap_or(0);
    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    drop(pair.slave);
    Ok((pid, child, reader, writer, pair.master))
}

#[tauri::command]
pub async fn cmd_terminal_session_open(
    app: AppHandle,
    state: State<'_, TerminalRegistry>,
    session_id: String,
    cwd: String,
) -> Result<CommandResponse<u32>, String> {
    let mut sessions_guard = state.sessions.lock().await;
    if let Some(existing) = sessions_guard.get(&session_id) {
        return Ok(CommandResponse::ok(existing.pid));
    }
    let workspace = match std::path::Path::new(&cwd).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => {
            return Ok(CommandResponse::err(format!(
                "Invalid terminal directory: {}",
                cwd
            )))
        }
    };
    let (pid, mut child, mut reader, writer, master) = match open_terminal_process(&workspace) {
        Ok(process) => process,
        Err(error) => {
            return Ok(CommandResponse::err(format!(
                "Unable to start terminal: {error:#}"
            )))
        }
    };
    let stdin = Arc::new(std::sync::Mutex::new(writer));
    sessions_guard.insert(
        session_id.clone(),
        ManagedTerminal {
            pid,
            stdin,
            master: Arc::new(std::sync::Mutex::new(master)),
        },
    );
    drop(sessions_guard);
    let output_app = app.clone();
    let output_id = session_id.clone();
    let output_thread = std::thread::spawn(move || {
        let mut buffer = vec![0_u8; 4096];
        loop {
            match std::io::Read::read(&mut reader, &mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let _ = output_app.emit(
                        "terminal-event",
                        NativeTerminalEvent {
                            session_id: output_id.clone(),
                            event_type: "output".into(),
                            output: Some(String::from_utf8_lossy(&buffer[..count]).to_string()),
                            exit_code: None,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });
    let sessions = Arc::clone(&state.sessions);
    let closed_id = session_id.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        let _ = output_thread.join();
        let exit_code = status.ok().map(|status| status.exit_code() as i32);
        tauri::async_runtime::spawn(async move {
            sessions.lock().await.remove(&closed_id);
            let _ = app.emit(
                "terminal-event",
                NativeTerminalEvent {
                    session_id: closed_id,
                    event_type: "closed".into(),
                    output: None,
                    exit_code,
                },
            );
        });
    });
    Ok(CommandResponse::ok(pid))
}

#[tauri::command]
pub async fn cmd_terminal_session_write(
    state: State<'_, TerminalRegistry>,
    session_id: String,
    input: String,
) -> Result<CommandResponse<bool>, String> {
    let writer = state
        .sessions
        .lock()
        .await
        .get(&session_id)
        .map(|session| Arc::clone(&session.stdin));
    let Some(writer) = writer else {
        return Ok(CommandResponse::err(
            "Terminal session is not running".into(),
        ));
    };
    let result = writer
        .lock()
        .map_err(|_| "Terminal input lock failed".to_string())
        .and_then(|mut writer| {
            writer
                .write_all(input.as_bytes())
                .and_then(|()| writer.flush())
                .map_err(|error| error.to_string())
        });
    match result {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(error.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_terminal_session_resize(
    state: State<'_, TerminalRegistry>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<CommandResponse<bool>, String> {
    if rows == 0 || cols == 0 {
        return Ok(CommandResponse::err(
            "Terminal size must be positive".into(),
        ));
    }
    let master = state
        .sessions
        .lock()
        .await
        .get(&session_id)
        .map(|session| Arc::clone(&session.master));
    let Some(master) = master else {
        return Ok(CommandResponse::err(
            "Terminal session is not running".into(),
        ));
    };
    let result = master
        .lock()
        .map_err(|_| "Terminal resize lock failed".to_string())
        .and_then(|master| {
            master
                .resize(portable_pty::PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| error.to_string())
        });
    match result {
        Ok(()) => Ok(CommandResponse::ok(true)),
        Err(error) => Ok(CommandResponse::err(error)),
    }
}

#[tauri::command]
pub async fn cmd_terminal_session_cwd(
    state: State<'_, TerminalRegistry>,
    session_id: String,
) -> Result<CommandResponse<String>, String> {
    let pid = state
        .sessions
        .lock()
        .await
        .get(&session_id)
        .map(|session| session.pid);
    let Some(pid) = pid else {
        return Ok(CommandResponse::err(
            "Terminal session is not running".into(),
        ));
    };
    let system = sysinfo::System::new_all();
    match system
        .process(sysinfo::Pid::from_u32(pid))
        .and_then(|process| process.cwd())
    {
        Some(cwd) => Ok(CommandResponse::ok(cwd.to_string_lossy().to_string())),
        None => Ok(CommandResponse::err(
            "Terminal working directory is unavailable".into(),
        )),
    }
}

#[tauri::command]
pub async fn cmd_terminal_session_close(
    state: State<'_, TerminalRegistry>,
    session_id: String,
) -> Result<CommandResponse<bool>, String> {
    let session = state.sessions.lock().await.remove(&session_id);
    match session {
        Some(session) => cmd_agent_run_stop(session.pid, None),
        None => Ok(CommandResponse::ok(true)),
    }
}

// ─── File Watching Commands ────────────────────────────────

#[derive(Default)]
pub struct WatcherRegistry {
    watchers: std::sync::Mutex<HashMap<String, (control::watcher::FileWatcher, usize)>>,
}

#[tauri::command]
pub fn cmd_watch_directory(
    app: AppHandle,
    state: State<'_, WatcherRegistry>,
    workspace_path: String,
) -> Result<CommandResponse<String>, String> {
    let root = match std::path::Path::new(&workspace_path).canonicalize() {
        Ok(path) if path.is_dir() => path,
        _ => {
            return Ok(CommandResponse::err(
                "Project workspace is unavailable".into(),
            ))
        }
    };
    let key = root.to_string_lossy().to_string();
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "Watcher registry is unavailable")?;
    if let Some((_, subscribers)) = watchers.get_mut(&key) {
        *subscribers += 1;
        return Ok(CommandResponse::ok(key));
    }
    let event_app = app.clone();
    match control::watcher::FileWatcher::watch_directory(&root, move |event| {
        let _ = event_app.emit("workspace-file-change", event);
    }) {
        Ok(watcher) => {
            watchers.insert(key.clone(), (watcher, 1));
            Ok(CommandResponse::ok(key))
        }
        Err(error) => Ok(CommandResponse::err(format!(
            "Unable to watch workspace: {error}"
        ))),
    }
}

#[tauri::command]
pub fn cmd_unwatch_directory(
    state: State<'_, WatcherRegistry>,
    workspace_path: String,
) -> Result<CommandResponse<bool>, String> {
    let key = std::path::Path::new(&workspace_path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(&workspace_path))
        .to_string_lossy()
        .to_string();
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "Watcher registry is unavailable")?;
    let removed = match watchers.get_mut(&key) {
        Some((_, subscribers)) if *subscribers > 1 => {
            *subscribers -= 1;
            true
        }
        Some(_) => watchers.remove(&key).is_some(),
        None => false,
    };
    Ok(CommandResponse::ok(removed))
}

// ─── Search Commands ───────────────────────────────────────

#[tauri::command]
pub async fn cmd_search(
    workspace_path: String,
    pattern: String,
    include_patterns: Option<Vec<String>>,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    use_regex: Option<bool>,
    include_generated: Option<bool>,
) -> Result<CommandResponse<Vec<SearchResultDTO>>, String> {
    match control::search::SearchEngine::search(
        &workspace_path,
        &pattern,
        include_patterns,
        case_sensitive.unwrap_or(false),
        whole_word.unwrap_or(false),
        use_regex.unwrap_or(false),
        include_generated.unwrap_or(false),
    )
    .await
    {
        Ok(results) => {
            let dtos: Vec<SearchResultDTO> = results
                .into_iter()
                .map(|r| SearchResultDTO {
                    file_path: r.file_path,
                    line_number: r.line_number,
                    line: r.line,
                })
                .collect();
            Ok(CommandResponse::ok(dtos))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResultDTO {
    pub file_path: String,
    pub line_number: usize,
    pub line: String,
}
