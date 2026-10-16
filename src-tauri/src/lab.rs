//! Project-lab actions: prepare a mission folder and open it in external tools.
//!
//! Safety rules (also covered by the labfs unit tests):
//! - Files are only written inside the lab folder the user picked, using
//!   sanitized names, and existing files are never overwritten unless the
//!   user confirmed it in the UI (`overwrite = true`).
//! - External tools are started directly (no shell string is ever built), with
//!   fixed arguments; the project folder is passed as the working directory.
//! - BYTEQUEST never runs mission commands for you. They are shown with an
//!   explanation and a Copy button; you run them yourself.

use labfs::{join_inside, sanitize_name, validate_open_target, validate_root, write_new, WriteOutcome};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct LabFile {
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareResult {
    folder: String,
    written: Vec<String>,
    skipped: Vec<String>,
}

#[tauri::command]
pub async fn lab_prepare(
    root: String,
    folder: String,
    files: Vec<LabFile>,
    overwrite: bool,
) -> Result<PrepareResult, String> {
    let root = PathBuf::from(root);
    validate_root(&root)?;
    std::fs::create_dir_all(&root).map_err(|e| format!("Could not create the lab folder: {e}"))?;
    let folder_name = sanitize_name(&folder);
    let dir = join_inside(&root, &folder_name)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let mut written = Vec::new();
    let mut skipped = Vec::new();
    for f in files {
        let name = sanitize_name(&f.name);
        let path = join_inside(&root, &format!("{folder_name}/{name}"))?;
        match write_new(&path, &f.content, overwrite)? {
            WriteOutcome::Written => written.push(name),
            WriteOutcome::SkippedExisting => skipped.push(name),
        }
    }
    Ok(PrepareResult { folder: dir.to_string_lossy().into_owned(), written, skipped })
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// Opens a project folder in Explorer, VS Code, Windows Terminal, or (Neo)Vim
/// inside Windows Terminal.
#[tauri::command]
pub async fn lab_open(path: String, tool: String) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    validate_open_target(&dir)?;
    open_with(&dir, &tool)
}

#[cfg(windows)]
fn open_with(dir: &Path, tool: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let spawn = |cmd: &mut Command| cmd.spawn().map(|_| ()).map_err(|e| e.to_string());

    match tool {
        "explorer" => {
            spawn(Command::new("explorer.exe").arg(dir))?;
            Ok("Opened in File Explorer.".into())
        }
        "vscode" => {
            // `code` is a .cmd shim on PATH; Rust escapes (or refuses) its arguments safely.
            if spawn(Command::new("code.cmd").arg(".").current_dir(dir).creation_flags(CREATE_NO_WINDOW)).is_ok() {
                return Ok("Opened in VS Code.".into());
            }
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                let exe = Path::new(&local).join("Programs").join("Microsoft VS Code").join("Code.exe");
                if exe.is_file() && spawn(Command::new(exe).arg(".").current_dir(dir)).is_ok() {
                    return Ok("Opened in VS Code.".into());
                }
            }
            Err("VS Code was not found. Install it, or make sure 'code' is on PATH.".into())
        }
        "terminal" => {
            if spawn(Command::new("wt.exe").args(["-d", "."]).current_dir(dir)).is_ok() {
                return Ok("Opened Windows Terminal in the project folder.".into());
            }
            spawn(Command::new("cmd.exe").current_dir(dir).creation_flags(CREATE_NEW_CONSOLE))?;
            Ok("Opened Command Prompt in the project folder.".into())
        }
        "nvim" | "vim" => {
            let editor = if tool == "nvim" { "nvim" } else { "vim" };
            if spawn(Command::new("wt.exe").args(["-d", ".", editor, "."]).current_dir(dir)).is_ok() {
                return Ok(format!("Opened {editor} in Windows Terminal."));
            }
            spawn(Command::new("cmd.exe").args(["/K", editor, "."]).current_dir(dir).creation_flags(CREATE_NEW_CONSOLE))?;
            Ok(format!("Opened {editor} in a console window."))
        }
        other => Err(format!("Unknown tool: {other}")),
    }
}

#[cfg(not(windows))]
fn open_with(_dir: &Path, tool: &str) -> Result<String, String> {
    Err(format!("Opening with '{tool}' is only available in the Windows build."))
}
