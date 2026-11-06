use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::oneshot;

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub last_modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DevRunResult {
    pub session_id: String,
    pub output: String,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub connected: bool,
    pub url: String,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.maximize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_is_maximized(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_open_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let path_str = folder.map(|f| f.to_string());
        let _ = tx.send(path_str);
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |file| {
        let path_str = file.map(|f| f.to_string());
        let _ = tx.send(path_str);
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_list(dir_path: String) -> Result<Vec<LocalEntry>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_path));
    }

    let read_dir = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".git" {
            continue;
        }

        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let last_modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        entries.push(LocalEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
            last_modified,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn local_workspace_read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

#[tauri::command]
pub async fn local_workspace_write_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content.as_bytes()).map_err(|e| format!("Failed to write {}: {}", file_path, e))
}

#[tauri::command]
pub async fn local_workspace_create_file(file_path: String, content: Option<String>) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content.unwrap_or_default().as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_create_dir(dir_path: String) -> Result<(), String> {
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_workspace_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

/// Hanzo Dev runs in flight, by the id the window chose, so Stop can end one.
#[derive(Default)]
pub struct DevRuns(Mutex<HashMap<String, oneshot::Sender<()>>>);

/// One line of `dev exec --json`, tagged with the run it belongs to.
#[derive(Clone, Serialize)]
pub struct DevEvent {
    pub run: String,
    pub event: Value,
}

/// The `dev` binary: HANZO_DEV_BIN, else ~/.local/bin/dev, else ~/.cargo/bin/dev, else PATH.
fn dev_bin() -> PathBuf {
    if let Ok(bin) = std::env::var("HANZO_DEV_BIN") {
        return PathBuf::from(bin);
    }
    let home = dirs::home_dir().unwrap_or_default();
    [home.join(".local/bin/dev"), home.join(".cargo/bin/dev")]
        .into_iter()
        .find(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from("dev"))
}

/// Asks `dev` to stop the way Ctrl-C does, so it interrupts the turn and ends
/// the commands it started in its sandbox; kills it if it has not exited in 5s.
async fn stop(child: &mut tokio::process::Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // SAFETY: kill(2) on a pid this process spawned and has not yet reaped.
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGINT) };
        if tokio::time::timeout(Duration::from_secs(5), child.wait())
            .await
            .is_ok()
        {
            return;
        }
    }
    let _ = child.start_kill();
}

/// Runs `bin exec` on a workspace in the workspace-write sandbox and hands each
/// JSON event to `on_event` as it is printed. Answers the agent's last message
/// (or why there is none) and whether the run succeeded; `cancelled` firing
/// stops it.
async fn drive(
    bin: &Path,
    workspace_path: &str,
    prompt: &str,
    mut cancelled: oneshot::Receiver<()>,
    mut on_event: impl FnMut(Value),
) -> Result<(String, bool), String> {
    let mut child = tokio::process::Command::new(bin)
        .args([
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--sandbox",
            "workspace-write",
            "-C",
        ])
        .arg(workspace_path)
        .arg(prompt)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to invoke dev at {:?}: {}", bin, e))?;

    let mut stderr = child.stderr.take().ok_or("dev stderr unavailable")?;
    let errors = tokio::spawn(async move {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text).await;
        text
    });
    let mut lines = BufReader::new(child.stdout.take().ok_or("dev stdout unavailable")?).lines();
    let mut answer = String::new();
    let mut failure = String::new();
    let mut failed = false;
    let mut stopped = false;
    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Ok(Some(line)) = line else { break };
                let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
                match (event["type"].as_str(), event["item"]["type"].as_str()) {
                    (Some("item.completed"), Some("agent_message")) => {
                        answer = event["item"]["text"].as_str().unwrap_or_default().to_string();
                    }
                    (Some("turn.failed"), _) => {
                        failed = true;
                        failure = event["error"]["message"].as_str().unwrap_or("turn failed").to_string();
                    }
                    (Some("error"), _) => {
                        failure = event["message"].as_str().unwrap_or("error").to_string();
                    }
                    _ => {}
                }
                on_event(event);
            }
            _ = &mut cancelled => {
                stopped = true;
                stop(&mut child).await;
                break;
            }
        }
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if stopped {
        return Ok(("Stopped.".to_string(), false));
    }
    let output = if !answer.is_empty() {
        answer
    } else if !failure.is_empty() {
        failure
    } else {
        // A command the agent left behind can hold stderr open after dev exits.
        let errors = tokio::time::timeout(Duration::from_secs(2), errors).await;
        errors
            .ok()
            .and_then(Result::ok)
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    Ok((output, status.success() && !failed))
}

/// Runs Hanzo Dev on a workspace: the agent plans, runs commands in the
/// workspace-write sandbox (writes inside `workspace_path` only, network off),
/// reads their output and iterates until it answers. Every event `dev exec
/// --json` prints is emitted as `dev-run` while it happens; the result is the
/// agent's last message. `local_workspace_cancel_dev` with the same `run` stops it.
#[tauri::command]
pub async fn local_workspace_run_dev(
    app: AppHandle,
    runs: State<'_, DevRuns>,
    run: String,
    workspace_path: String,
    prompt: String,
) -> Result<DevRunResult, String> {
    let (cancel, cancelled) = oneshot::channel();
    runs.0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(run.clone(), cancel);
    let result = drive(&dev_bin(), &workspace_path, &prompt, cancelled, |event| {
        let _ = app.emit(
            "dev-run",
            DevEvent {
                run: run.clone(),
                event,
            },
        );
    })
    .await;
    if let Ok(mut map) = runs.0.lock() {
        map.remove(&run);
    }
    let (output, success) = result?;
    Ok(DevRunResult {
        session_id: run,
        output,
        success,
    })
}

/// Stops a Hanzo Dev run started by `local_workspace_run_dev`. False when no
/// run by that id is in flight.
#[tauri::command]
pub fn local_workspace_cancel_dev(runs: State<'_, DevRuns>, run: String) -> bool {
    let cancel = runs.0.lock().ok().and_then(|mut map| map.remove(&run));
    cancel.map(|c| c.send(()).is_ok()).unwrap_or(false)
}

#[tauri::command]
pub async fn keychain_get(service: String, key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pwd) => Ok(Some(pwd)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn keychain_set(service: String, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keychain_delete(service: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn bot_check_gateway(url: Option<String>) -> Result<GatewayStatus, String> {
    let target = url.unwrap_or_else(|| "http://127.0.0.1:18789".to_string());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .map_err(|e| e.to_string())?;

    let health_url = format!("{}/health", target.trim_end_matches('/'));
    match client.get(&health_url).send().await {
        Ok(res) => {
            if res.status().is_success() {
                Ok(GatewayStatus {
                    connected: true,
                    url: target,
                    version: Some("hanzo-bot-v1".to_string()),
                    message: Some("Local gateway online".to_string()),
                })
            } else {
                Ok(GatewayStatus {
                    connected: false,
                    url: target,
                    version: None,
                    message: Some(format!("Gateway returned HTTP {}", res.status())),
                })
            }
        }
        Err(e) => Ok(GatewayStatus {
            connected: false,
            url: target,
            version: None,
            message: Some(e.to_string()),
        }),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A stand-in `dev` in a fresh directory: records its arguments beside
    /// itself, then runs `body`.
    fn fake_dev(body: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fake-dev-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let bin = dir.join("dev");
        fs::write(
            &bin,
            format!("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$(dirname \"$0\")/args\"\n{body}\n"),
        )
        .unwrap();
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }

    #[tokio::test]
    async fn runs_in_the_workspace_sandbox_and_streams_every_event() {
        let bin = fake_dev(concat!(
            "echo '{\"type\":\"thread.started\"}'\n",
            "echo 'not json'\n",
            "echo '{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"cat a\",\"exit_code\":0}}'\n",
            "echo '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"done\"}}'\n",
            "echo '{\"type\":\"turn.completed\"}'",
        ));
        let (_cancel, cancelled) = oneshot::channel();
        let mut seen = Vec::new();
        let (output, success) = drive(&bin, "/work/space", "do it", cancelled, |e| {
            seen.push(e["type"].as_str().unwrap_or_default().to_string())
        })
        .await
        .unwrap();

        assert_eq!(output, "done");
        assert!(success);
        assert_eq!(
            seen,
            [
                "thread.started",
                "item.completed",
                "item.completed",
                "turn.completed"
            ]
        );
        let args = fs::read_to_string(bin.with_file_name("args")).unwrap();
        assert_eq!(
            args.lines().collect::<Vec<_>>(),
            [
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--sandbox",
                "workspace-write",
                "-C",
                "/work/space",
                "do it"
            ]
        );
    }

    #[tokio::test]
    async fn a_failed_turn_is_a_failure_with_its_reason() {
        let bin =
            fake_dev("echo '{\"type\":\"turn.failed\",\"error\":{\"message\":\"model refused\"}}'");
        let (_cancel, cancelled) = oneshot::channel();
        let (output, success) = drive(&bin, "/w", "p", cancelled, |_| {}).await.unwrap();
        assert_eq!(output, "model refused");
        assert!(!success);
    }

    #[tokio::test]
    async fn stop_interrupts_a_running_agent() {
        let bin =
            fake_dev("trap 'exit 130' INT\necho '{\"type\":\"turn.started\"}'\nsleep 30 & wait");
        let (cancel, cancelled) = oneshot::channel();
        let mut cancel = Some(cancel);
        let started = std::time::Instant::now();
        let (output, success) = drive(&bin, "/w", "p", cancelled, |_| {
            if let Some(c) = cancel.take() {
                let _ = c.send(());
            }
        })
        .await
        .unwrap();
        assert_eq!(output, "Stopped.");
        assert!(!success);
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "took {:?}",
            started.elapsed()
        );
    }

    #[tokio::test]
    async fn a_missing_binary_is_an_error() {
        let (_cancel, cancelled) = oneshot::channel();
        let err = drive(Path::new("/nonexistent/dev"), "/w", "p", cancelled, |_| {})
            .await
            .unwrap_err();
        assert!(err.starts_with("Failed to invoke dev"), "{err}");
    }
}
