//! Path safety rules for the BYTEQUEST project lab.
//!
//! Pure standard-library code with no dependencies, so it is unit-tested on its
//! own (`cargo test --manifest-path src-tauri/labfs/Cargo.toml`) on every build.
//! The app only ever writes inside a folder the user picked, using names that
//! pass `sanitize_name`, and never overwrites an existing file unless asked.

use std::path::{Component, Path, PathBuf};

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub const MAX_NAME: usize = 80;

/// Turns arbitrary text into a safe single file or folder name.
/// Keeps ASCII letters, digits, '-', '_' and '.', maps spaces to '-',
/// drops everything else, strips leading/trailing dots and dashes, and
/// avoids Windows reserved device names. Never returns an empty string.
pub fn sanitize_name(raw: &str) -> String {
    let mut out = String::new();
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else if ch == ' ' {
            out.push('-');
        }
    }
    while out.contains("..") {
        out = out.replace("..", ".");
    }
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    let trimmed: String = out.trim_matches(|c| c == '.' || c == '-').chars().take(MAX_NAME).collect();
    let trimmed = trimmed.trim_end_matches(|c| c == '.' || c == '-').to_string();
    if trimmed.is_empty() {
        return "untitled".to_string();
    }
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        return format!("_{trimmed}");
    }
    trimmed
}

/// True when `name` is already a safe single path component.
pub fn is_safe_name(name: &str) -> bool {
    !name.is_empty() && sanitize_name(name) == name
}

/// A lab root must be an absolute path with at least two normal components
/// below the drive or filesystem root (so never `C:\` or `C:\Users`).
pub fn validate_root(root: &Path) -> Result<(), String> {
    if !root.is_absolute() {
        return Err("The lab folder must be a full path (for example C:\\Users\\you\\Documents\\BYTEQUEST Lab).".into());
    }
    let mut normal = 0;
    for comp in root.components() {
        match comp {
            Component::Normal(_) => normal += 1,
            Component::ParentDir => return Err("The lab folder path may not contain '..'.".into()),
            _ => {}
        }
    }
    if normal < 2 {
        return Err("Pick a folder inside your user folder, not the top of a drive.".into());
    }
    Ok(())
}

/// Joins a relative path made of safe names onto `root`.
/// Rejects absolute paths, '..', empty parts and unsafe names.
pub fn join_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    validate_root(root)?;
    let mut out = root.to_path_buf();
    let parts: Vec<&str> = rel.split(['/', '\\']).collect();
    if parts.is_empty() || parts.len() > 4 {
        return Err(format!("Unsupported path: {rel}"));
    }
    for part in parts {
        if part.is_empty() || part == "." || part == ".." || !is_safe_name(part) {
            return Err(format!("Unsafe path part '{part}' in {rel}"));
        }
        out.push(part);
    }
    if !out.starts_with(root) {
        return Err("Path escapes the lab folder.".into());
    }
    Ok(out)
}

#[derive(Debug, PartialEq, Eq)]
pub enum WriteOutcome {
    Written,
    SkippedExisting,
}

/// Writes `contents` to `path` unless it exists and `overwrite` is false.
pub fn write_new(path: &Path, contents: &str, overwrite: bool) -> Result<WriteOutcome, String> {
    if path.exists() && !overwrite {
        return Ok(WriteOutcome::SkippedExisting);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
    }
    std::fs::write(path, contents).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(WriteOutcome::Written)
}

/// An existing directory the user may open in an external tool.
pub fn validate_open_target(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Project folder must be a full path.".into());
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Project folder path may not contain '..'.".into());
    }
    if !path.is_dir() {
        return Err(format!("Folder not found: {}", path.display()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join("labfs-tests").join(tag);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_name("Subnet Surveyor"), "Subnet-Surveyor");
        assert_eq!(sanitize_name("../../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_name("..\\..\\Windows"), "Windows");
        assert_eq!(sanitize_name("CON"), "_CON");
        assert_eq!(sanitize_name("nul.txt"), "_nul.txt");
        assert_eq!(sanitize_name(""), "untitled");
        assert_eq!(sanitize_name("...."), "untitled");
        assert_eq!(sanitize_name("maze_07.txt"), "maze_07.txt");
        assert_eq!(sanitize_name("a:b|c?d*e"), "abcde");
        assert!(sanitize_name(&"x".repeat(500)).len() <= MAX_NAME);
    }

    #[test]
    fn safe_name_check() {
        assert!(is_safe_name("BRIEF.md"));
        assert!(!is_safe_name(".."));
        assert!(!is_safe_name("a/b"));
        assert!(!is_safe_name(""));
    }

    #[test]
    fn root_rules() {
        let root = tmp_root("root");
        assert!(validate_root(&root).is_ok());
        assert!(validate_root(Path::new("relative/dir")).is_err());
        assert!(validate_root(Path::new("/")).is_err());
        assert!(validate_root(Path::new("/tmp")).is_err());
        assert!(validate_root(&root.join("..").join("x")).is_err());
    }

    #[test]
    fn join_stays_inside() {
        let root = tmp_root("join");
        assert_eq!(join_inside(&root, "mission-1/BRIEF.md").unwrap(), root.join("mission-1").join("BRIEF.md"));
        assert!(join_inside(&root, "../escape.txt").is_err());
        assert!(join_inside(&root, "/etc/passwd").is_err());
        assert!(join_inside(&root, "a//b").is_err());
        assert!(join_inside(&root, "ok/../../x").is_err());
        assert!(join_inside(&root, "bad name").is_err());
        assert!(join_inside(&root, "a/b/c/d/e").is_err());
    }

    #[test]
    fn never_overwrites_by_default() {
        let root = tmp_root("write");
        let p = join_inside(&root, "m/data.txt").unwrap();
        assert_eq!(write_new(&p, "one", false).unwrap(), WriteOutcome::Written);
        assert_eq!(write_new(&p, "two", false).unwrap(), WriteOutcome::SkippedExisting);
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "one");
        assert_eq!(write_new(&p, "three", true).unwrap(), WriteOutcome::Written);
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "three");
    }

    #[test]
    fn open_target_rules() {
        let root = tmp_root("open");
        assert!(validate_open_target(&root).is_ok());
        assert!(validate_open_target(&root.join("missing")).is_err());
        assert!(validate_open_target(Path::new("relative")).is_err());
    }
}
