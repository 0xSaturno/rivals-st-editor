//! CLI Mode for Rivals ST Editor
//!
//! Provides command-line interface for batch processing StringTable projects.
//!
//! Commands:
//! - make_project: Create .rstp from uasset/json files
//! - apply_project: Apply .rstp to create modded uasset files
//! - apply_project_pak: Apply .rstp and create IoStore pak

use colored::*;
use glob::glob;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::{get_settings_path, get_temp_dir, load_settings, AppSettings};

// ============================================================================
// PROJECT FORMAT (Enhanced .rstp)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RstpProject {
    pub version: u32,
    /// Source asset paths (relative game paths like "Marvel/Content/...")
    #[serde(default)]
    pub source_paths: Vec<SourceAsset>,
    /// File data with entries
    pub files: Vec<RstpFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceAsset {
    /// Original filename (e.g., "ST_CharacterMeta.uasset")
    pub file_name: String,
    /// Game asset path (e.g., "Marvel/Content/StringTables/ST_CharacterMeta")
    pub game_path: String,
    /// Full local path when project was created (optional, for reference)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RstpFile {
    pub file_name: String,
    pub table_namespace: String,
    pub entries: Vec<RstpEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RstpEntry {
    pub key: String,
    pub value: String,
}

// ============================================================================
// GLOB PATTERN EXPANSION (for PowerShell compatibility)
// ============================================================================

/// Expand glob patterns in input paths (e.g., "folder/*.json" -> actual files)
fn expand_input_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut expanded = Vec::new();

    for path in paths {
        // Check if path contains glob patterns
        if path.contains('*') || path.contains('?') {
            // Try to expand as glob pattern
            match glob(&path) {
                Ok(paths_iter) => {
                    let mut found = false;
                    for entry in paths_iter {
                        match entry {
                            Ok(path_buf) => {
                                expanded.push(path_buf.to_string_lossy().to_string());
                                found = true;
                            }
                            Err(e) => return Err(format!("Error reading glob match: {}", e)),
                        }
                    }
                    if !found {
                        return Err(format!("No files matching pattern: {}", path));
                    }
                }
                Err(e) => return Err(format!("Invalid glob pattern '{}': {}", path, e)),
            }
        } else {
            // Regular path - keep as-is
            expanded.push(path);
        }
    }

    Ok(expanded)
}

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

pub struct CliArgs {
    pub command: String,
    pub input_paths: Vec<String>,
    pub output_path: Option<String>,
    pub base_asset_path: Option<String>,
    pub usmap_override: Option<String>,
    pub auto_extract: bool,
}

impl CliArgs {
    pub fn parse(args: Vec<String>) -> Result<Self, String> {
        if args.len() < 2 {
            return Err("No command provided".to_string());
        }

        let command = args[1].to_lowercase();
        let mut input_paths = Vec::new();
        let mut output_path = None;
        let mut base_asset_path = None;
        let mut usmap_override = None;
        let mut auto_extract = false;

        let mut i = 2;
        while i < args.len() {
            match args[i].as_str() {
                "-i" | "--input" => {
                    i += 1;
                    while i < args.len() && !args[i].starts_with('-') {
                        input_paths.push(args[i].clone());
                        i += 1;
                    }
                }
                "-o" | "--output" => {
                    i += 1;
                    if i < args.len() {
                        output_path = Some(args[i].clone());
                        i += 1;
                    }
                }
                "-b" | "--base" => {
                    i += 1;
                    if i < args.len() {
                        base_asset_path = Some(args[i].clone());
                        i += 1;
                    }
                }
                "-m" | "--usmap" => {
                    i += 1;
                    if i < args.len() {
                        usmap_override = Some(args[i].clone());
                        i += 1;
                    }
                }
                "--auto-extract" | "-a" => {
                    auto_extract = true;
                    i += 1;
                }
                _ => {
                    // Could be a positional argument
                    i += 1;
                }
            }
        }

        // Expand glob patterns in input paths (for PowerShell compatibility)
        let input_paths = expand_input_paths(input_paths)?;

        Ok(CliArgs {
            command,
            input_paths,
            output_path,
            base_asset_path,
            usmap_override,
            auto_extract,
        })
    }
}

// ============================================================================
// TOOL PATH RESOLUTION (CLI version - no AppHandle)
// ============================================================================

fn get_uasset_tool_path() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));

    // Check bundled location first (next to the exe)
    let bundled = exe_dir.join("tools").join("UAssetTool.exe");
    if bundled.exists() {
        return bundled;
    }

    // Try resource folder structure
    let bundled_alt = exe_dir.join("UAssetTool.exe");
    if bundled_alt.exists() {
        return bundled_alt;
    }

    // Dev paths
    let cwd = std::env::current_dir().unwrap_or_default();

    let dev_debug = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Debug")
        .join("net8.0")
        .join("win-x64")
        .join("UAssetTool.exe");
    if dev_debug.exists() {
        return dev_debug;
    }

    let dev_release = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Release")
        .join("net8.0")
        .join("win-x64")
        .join("UAssetTool.exe");
    if dev_release.exists() {
        return dev_release;
    }

    let dev_publish = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Release")
        .join("net8.0")
        .join("win-x64")
        .join("publish")
        .join("UAssetTool.exe");
    if dev_publish.exists() {
        return dev_publish;
    }

    // Return expected path for better error messages
    bundled
}

fn ensure_temp_dir() -> Result<PathBuf, String> {
    let temp_dir = get_temp_dir();
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }
    Ok(temp_dir)
}

fn get_temp_json_path(uasset_path: &PathBuf) -> PathBuf {
    let temp_dir = get_temp_dir();
    let mut hasher = DefaultHasher::new();
    uasset_path.to_string_lossy().hash(&mut hasher);
    let path_hash = hasher.finish();
    let stem = uasset_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    temp_dir.join(format!("{}_{:x}.json", stem, path_hash))
}

// ============================================================================
// UASSETTOOL INTERACTION
// ============================================================================

/// Convert uasset to JSON using UAssetTool
fn convert_uasset_to_json(
    uasset_path: &PathBuf,
    usmap_path: &Option<String>,
) -> Result<PathBuf, String> {
    let tool_path = get_uasset_tool_path();
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    ensure_temp_dir()?;
    let json_path = get_temp_json_path(uasset_path);

    let request = serde_json::json!({
        "action": "export_to_json",
        "file_path": uasset_path.to_string_lossy(),
        "usmap_path": usmap_path,
        "output_path": json_path.to_string_lossy()
    });

    let mut child = Command::new(&tool_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start UAssetTool: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for UAssetTool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Always print stderr for debugging if not empty
    if !stderr.is_empty() {
        eprintln!("[CLI] UAssetTool stderr: {}", stderr);
    }

    // Check if stdout was empty (which causes JSON parse error)
    if stdout.trim().is_empty() {
        return Err(format!(
            "UAssetTool produced empty output. Exit code: {:?}\nStderr: {}",
            output.status.code(),
            stderr
        ));
    }

    if output.status.success() {
        if let Ok(response) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if response["success"].as_bool().unwrap_or(false) {
                // Verify the generated file is not empty
                match fs::metadata(&json_path) {
                    Ok(metadata) => {
                        if metadata.len() == 0 {
                            return Err(format!("UAssetTool reported success, but generated JSON file is EMPTY: {:?}", json_path));
                        }
                        println!("[CLI] Generated JSON size: {} bytes", metadata.len());
                    }
                    Err(e) => {
                        return Err(format!("UAssetTool reported success, but generated JSON file not found: {:?} ({})", json_path, e));
                    }
                }
                return Ok(json_path);
            } else {
                return Err(response["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string());
            }
        } else {
            return Err(format!("Failed to parse UAssetTool response: {}", stdout));
        }
    } else {
        Err(format!("UAssetTool failed:\n{}\n{}", stdout, stderr))
    }
}

/// Convert JSON back to uasset using UAssetTool
fn convert_json_to_uasset(
    json_path: &PathBuf,
    output_path: &PathBuf,
    usmap_path: &Option<String>,
) -> Result<(), String> {
    let tool_path = get_uasset_tool_path();
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    let json_data = fs::read_to_string(json_path).map_err(|e| e.to_string())?;

    let request = serde_json::json!({
        "action": "import_from_json",
        "file_path": output_path.to_string_lossy(),
        "usmap_path": usmap_path,
        "json_data": json_data
    });

    let mut child = Command::new(&tool_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start UAssetTool: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for UAssetTool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if output.status.success() {
        if let Ok(response) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if response["success"].as_bool().unwrap_or(false) {
                return Ok(());
            } else {
                return Err(response["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string());
            }
        }
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("UAssetTool failed:\n{}\n{}", stdout, stderr))
    }
}

/// Extract asset from game paks using UAssetTool
fn extract_asset_from_paks(
    game_path: &str,
    paks_dir: &str,
    usmap_path: &Option<String>,
) -> Result<PathBuf, String> {
    let tool_path = get_uasset_tool_path();
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    ensure_temp_dir()?;

    // Extract filename from game path (e.g., "Marvel/Content/StringTables/ST_CharacterMeta" -> "ST_CharacterMeta.uasset")
    let asset_name = game_path.split('/').last().ok_or("Invalid game path")?;
    let output_path = get_temp_dir().join(format!("{}.uasset", asset_name));

    // Clean up existing file to prevent stale reads
    if output_path.exists() {
        let _ = fs::remove_file(&output_path);
    }

    println!("{}", "[CLI] Extracting asset from game paks...".cyan());
    println!(
        "{}  Game path: {}",
        "[CLI]".cyan(),
        game_path.bright_white()
    );
    println!(
        "{}  Output: {:?}",
        "[CLI]".cyan(),
        output_path.to_string_lossy().bright_white()
    );

    let request = serde_json::json!({
        "action": "extract_from_paks",
        "game_path": game_path,
        "paks_directory": paks_dir,
        "usmap_path": usmap_path,
        "output_path": output_path.to_string_lossy()
    });

    let mut child = Command::new(&tool_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start UAssetTool: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for UAssetTool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        eprintln!("[CLI] UAssetTool stderr: {}", stderr);
    }

    if output.status.success() {
        if let Ok(response) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if response["success"].as_bool().unwrap_or(false) {
                if output_path.exists() {
                    println!("{}  {}", "[CLI]".cyan(), "Extracted successfully!".green());
                    return Ok(output_path);
                } else {
                    return Err("UAssetTool reported success but file not found".to_string());
                }
            } else {
                return Err(response["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string());
            }
        }
    }

    Err(format!("Failed to extract asset:\n{}\n{}", stdout, stderr))
}

/// Create mod IoStore pak using UAssetTool
fn create_mod_iostore(output_base: &PathBuf, uasset_paths: &[PathBuf]) -> Result<(), String> {
    let tool_path = get_uasset_tool_path();
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    let mut cmd = Command::new(&tool_path);
    cmd.arg("create_mod_iostore")
        .arg(output_base.to_string_lossy().to_string());

    for path in uasset_paths {
        cmd.arg(path.to_string_lossy().to_string());
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run UAssetTool: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("Failed to create pak:\n{}\n{}", stdout, stderr))
    }
}

// ============================================================================
// STRINGTABLE PARSING
// ============================================================================

#[derive(Debug, Deserialize)]
struct UAssetJson {
    #[serde(rename = "Exports")]
    exports: Vec<UAssetExport>,
}

#[derive(Debug, Deserialize)]
struct UAssetExport {
    #[serde(rename = "$TYPE", alias = "$type", alias = "Type")]
    export_type: Option<String>,
    #[serde(rename = "StringTable")]
    string_table: Option<StringTableData>,
    /// Some versions call it "Table"
    #[serde(rename = "Table")]
    table: Option<StringTableData>,
    #[serde(rename = "Namespace")]
    namespace: Option<String>,
    #[serde(rename = "TableNamespace")]
    table_namespace: Option<String>,
}

impl UAssetExport {
    fn is_string_table(&self) -> bool {
        if let Some(ref t) = self.export_type {
            return t.contains("StringTable");
        }
        // Fallback: check if it has StringTable or Table fields
        self.string_table.is_some() || self.table.is_some()
    }
}

#[derive(Debug, Deserialize)]
struct StringTableData {
    #[serde(rename = "TableNamespace")]
    table_namespace: Option<String>,
    #[serde(rename = "KeysToMetaData")]
    keys_to_metadata: Option<std::collections::HashMap<String, String>>,
    /// Alternative format: Value: [ [Key, Val], ... ]
    #[serde(rename = "Value")]
    value_list: Option<Vec<Vec<String>>>,
}

/// Extract StringTable entries from JSON
fn extract_string_table_entries(json_path: &PathBuf) -> Result<(String, Vec<RstpEntry>), String> {
    let content =
        fs::read_to_string(json_path).map_err(|e| format!("Failed to read JSON: {}", e))?;

    // Strip UTF-8 BOM if present (UAssetTool/Win32 often adds it)
    let content = content.strip_prefix("\u{feff}").unwrap_or(&content);

    let json: UAssetJson =
        serde_json::from_str(content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    for (idx, export) in json.exports.iter().enumerate() {
        if export.is_string_table() {
            // Check both "StringTable" and "Table" fields
            let st_data = export.string_table.as_ref().or(export.table.as_ref());

            if let Some(st) = st_data {
                let namespace = st.table_namespace.clone().unwrap_or_default();
                let mut entries = Vec::new();

                // Handle map format
                if let Some(ref keys) = st.keys_to_metadata {
                    for (k, v) in keys {
                        entries.push(RstpEntry {
                            key: k.clone(),
                            value: v.clone(),
                        });
                    }
                }
                // Handle list format (Value: [[k, v], ...])
                else if let Some(ref list) = st.value_list {
                    for pair in list {
                        if pair.len() >= 2 {
                            entries.push(RstpEntry {
                                key: pair[0].clone(),
                                value: pair[1].clone(),
                            });
                        }
                    }
                }

                return Ok((namespace, entries));
            } else {
                eprintln!(
                    "{} Export {} detected as StringTable but no data fields found",
                    "[DEBUG]".yellow(),
                    idx
                );
                eprintln!("  export_type: {:?}", export.export_type);
                eprintln!("  has string_table: {}", export.string_table.is_some());
                eprintln!("  has table: {}", export.table.is_some());
            }
        }
    }

    // Debug: print export types
    eprintln!(
        "{} Found {} exports:",
        "[DEBUG]".yellow(),
        json.exports.len()
    );
    for (idx, export) in json.exports.iter().enumerate() {
        eprintln!("  Export {}: type = {:?}", idx, export.export_type);
    }

    Err("No StringTable export found in JSON".to_string())
}

/// Apply entries back to JSON
fn apply_entries_to_json(json_path: &PathBuf, entries: &[RstpEntry]) -> Result<(), String> {
    let content =
        fs::read_to_string(json_path).map_err(|e| format!("Failed to read JSON: {}", e))?;

    // Strip UTF-8 BOM if present
    let content = content.strip_prefix("\u{feff}").unwrap_or(&content);

    // Debug: print first 100 chars if parsing fails
    let mut json: serde_json::Value = serde_json::from_str(content).map_err(|e| {
        eprintln!(
            "[CLI] {} JSON parse error. First 100 chars of file:",
            "[ERROR]".red()
        );
        eprintln!("{}", content.chars().take(100).collect::<String>());
        eprintln!("{} File size: {} bytes", "[CLI]".cyan(), content.len());
        format!("Failed to parse JSON: {}", e)
    })?;

    // Find and update the StringTable export
    if let Some(exports) = json.get_mut("Exports").and_then(|e| e.as_array_mut()) {
        for export in exports.iter_mut() {
            // Check export type
            let type_str = export
                .get("$TYPE")
                .or_else(|| export.get("$type"))
                .or_else(|| export.get("Type"))
                .and_then(|t| t.as_str());

            let is_string_table_type = type_str.map(|t| t.contains("StringTable")).unwrap_or(false);

            // Fallback: check if it has StringTable or Table fields
            let has_table_data =
                export.get("StringTable").is_some() || export.get("Table").is_some();

            let is_string_table = is_string_table_type || has_table_data;

            if is_string_table {
                // Try "StringTable" then "Table"
                let target_field = if export.get("StringTable").is_some() {
                    "StringTable"
                } else if export.get("Table").is_some() {
                    "Table"
                } else {
                    continue;
                };

                if let Some(st) = export.get_mut(target_field) {
                    // Method 1: KeysToMetaData (Map)
                    if let Some(keys) = st.get_mut("KeysToMetaData") {
                        if let Some(keys_obj) = keys.as_object_mut() {
                            for entry in entries {
                                keys_obj.insert(
                                    entry.key.clone(),
                                    serde_json::Value::String(entry.value.clone()),
                                );
                            }
                        }
                    }
                    // Method 2: Value (List of pairs)
                    else if let Some(val_arr) = st.get_mut("Value") {
                        if let Some(arr) = val_arr.as_array_mut() {
                            // Rebuild array or update existing?
                            // Updating is tricky O(N*M). Let's convert to map, update, convert back?
                            // Simpler: iterate existing to update, append new.

                            for entry in entries {
                                let mut found = false;
                                for item in arr.iter_mut() {
                                    if let Some(pair) = item.as_array_mut() {
                                        if pair.len() >= 2 && pair[0].as_str() == Some(&entry.key) {
                                            pair[1] =
                                                serde_json::Value::String(entry.value.clone());
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                                if !found {
                                    // Append new
                                    arr.push(serde_json::json!([entry.key, entry.value]));
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    // Write back
    let updated = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(json_path, updated).map_err(|e| format!("Failed to write JSON: {}", e))?;

    Ok(())
}

/// Try to infer game path from uasset path
fn infer_game_path(uasset_path: &PathBuf) -> Option<String> {
    let path_str = uasset_path.to_string_lossy().replace('\\', "/");

    // Look for Marvel/Content in the path
    if let Some(idx) = path_str.find("Marvel/Content") {
        let game_path = &path_str[idx..];
        // Remove .uasset extension
        return Some(game_path.trim_end_matches(".uasset").to_string());
    }

    // Fallback: just use the filename
    uasset_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| format!("Marvel/Content/StringTables/{}", s))
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

/// make_project: Create .rstp from uasset files
pub fn cmd_make_project(args: &CliArgs, settings: &AppSettings) -> Result<(), String> {
    if args.input_paths.is_empty() {
        return Err("No input files specified. Use -i <file1> [file2] ...".to_string());
    }

    let output_path = args
        .output_path
        .as_ref()
        .ok_or("No output path specified. Use -o <project.rstp>")?;

    let usmap_path = args.usmap_override.clone().or(settings.usmap_path.clone());

    println!(
        "[CLI] Creating project from {} file(s)...",
        args.input_paths.len()
    );

    let mut project = RstpProject {
        version: 2, // Version 2 includes source_paths
        source_paths: Vec::new(),
        files: Vec::new(),
    };

    for input_path in &args.input_paths {
        let input = PathBuf::from(input_path);

        if !input.exists() {
            return Err(format!("Input file not found: {}", input_path));
        }

        let file_name = input
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        println!(
            "{} Processing: {}",
            "[CLI]".cyan(),
            file_name.bright_white()
        );

        // Check if it's already JSON or needs conversion
        let json_path = if input.extension().and_then(|e| e.to_str()) == Some("json") {
            input.clone()
        } else {
            // Convert uasset to JSON
            println!("{}  Converting to JSON...", "[CLI]".cyan());
            convert_uasset_to_json(&input, &usmap_path)?
        };

        // Extract StringTable entries
        let (namespace, entries) = extract_string_table_entries(&json_path)?;
        println!(
            "{}  Found {} entries in namespace '{}'",
            "[CLI]".cyan(),
            entries.len().to_string().green(),
            namespace.bright_white()
        );

        // Add source asset info
        let game_path = infer_game_path(&input).unwrap_or_else(|| file_name.clone());
        project.source_paths.push(SourceAsset {
            file_name: file_name.clone(),
            game_path,
            local_path: Some(input.to_string_lossy().to_string()),
        });

        project.files.push(RstpFile {
            file_name,
            table_namespace: namespace,
            entries,
        });
    }

    // Save project
    let project_json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;

    fs::write(output_path, project_json)
        .map_err(|e| format!("Failed to write project file: {}", e))?;

    println!(
        "{} Project saved to: {}",
        "[CLI]".cyan(),
        output_path.green()
    );
    println!(
        "{}  {} file(s), {} total entries",
        "[CLI]".cyan(),
        project.files.len().to_string().green(),
        project
            .files
            .iter()
            .map(|f| f.entries.len())
            .sum::<usize>()
            .to_string()
            .green()
    );

    Ok(())
}

/// apply_project: Apply .rstp to create modded uasset files
pub fn cmd_apply_project(args: &CliArgs, settings: &AppSettings) -> Result<Vec<PathBuf>, String> {
    if args.input_paths.is_empty() {
        return Err("No project file specified. Use -i <project.rstp>".to_string());
    }

    let project_path = &args.input_paths[0];

    // Load project
    let project_content = fs::read_to_string(project_path)
        .map_err(|e| format!("Failed to read project file: {}", e))?;

    let project: RstpProject = serde_json::from_str(&project_content)
        .map_err(|e| format!("Failed to parse project file: {}", e))?;

    println!(
        "{} Loaded project {} with {} file(s)",
        "[CLI]".cyan(),
        format!("v{}", project.version).bright_white(),
        project.files.len().to_string().green()
    );

    let usmap_path = args.usmap_override.clone().or(settings.usmap_path.clone());

    // Determine output directory
    let output_dir = if let Some(ref out) = args.output_path {
        PathBuf::from(out)
    } else {
        // Default to temp directory
        ensure_temp_dir()?
    };

    if !output_dir.exists() {
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let mut output_uassets = Vec::new();

    for (idx, file) in project.files.iter().enumerate() {
        println!(
            "{} Processing file {}/{}: {}",
            "[CLI]".cyan(),
            (idx + 1).to_string().bright_white(),
            project.files.len().to_string().bright_white(),
            file.file_name.bright_white()
        );

        // Find the base asset
        let base_path = if let Some(ref base) = args.base_asset_path {
            // User provided explicit base path
            let path = PathBuf::from(base);
            if !path.exists() {
                return Err(format!("Base asset not found: {:?}", path));
            }
            path
        } else if project.version >= 2 && idx < project.source_paths.len() {
            // Try to use local_path from project
            if let Some(ref local) = project.source_paths[idx].local_path {
                let path = PathBuf::from(local);
                if path.exists() {
                    path
                } else if args.auto_extract {
                    // Auto-extract from game paks
                    println!(
                        "{}  {}",
                        "[CLI]".cyan(),
                        "Base asset not found locally, attempting auto-extract...".yellow()
                    );
                    let game_path = &project.source_paths[idx].game_path;
                    let paks_dir = settings.rivals_pak_path.as_ref()
                        .ok_or("Rivals Paks path not configured. Run GUI to set it or use -b <base.uasset>")?;
                    extract_asset_from_paks(game_path, paks_dir, &usmap_path)?
                } else {
                    return Err(format!(
                        "Base asset not found: {:?}\nUse -b <base.uasset> or --auto-extract to extract from game paks",
                        path
                    ));
                }
            } else if args.auto_extract && project.version >= 2 {
                // No local path, but we have game path - extract it
                println!(
                    "{}  {}",
                    "[CLI]".cyan(),
                    "No local path in project, attempting auto-extract...".yellow()
                );
                let game_path = &project.source_paths[idx].game_path;
                let paks_dir = settings.rivals_pak_path.as_ref().ok_or(
                    "Rivals Paks path not configured. Run GUI to set it or use -b <base.uasset>",
                )?;
                extract_asset_from_paks(game_path, paks_dir, &usmap_path)?
            } else {
                return Err(format!(
                    "No base asset path for '{}'. Use -b <base.uasset> or --auto-extract",
                    file.file_name
                ));
            }
        } else if args.auto_extract && project.version >= 2 && idx < project.source_paths.len() {
            // Auto-extract using game path from project
            println!("{}  Using auto-extract...", "[CLI]".cyan());
            let game_path = &project.source_paths[idx].game_path;
            let paks_dir = settings.rivals_pak_path.as_ref().ok_or(
                "Rivals Paks path not configured. Run GUI to set it or use -b <base.uasset>",
            )?;
            extract_asset_from_paks(game_path, paks_dir, &usmap_path)?
        } else {
            if args.auto_extract && project.version < 2 {
                return Err(format!(
                    "Auto-extract requires project version 2 (current: v{}).\n\
                    Your project doesn't include source asset metadata needed for auto-extraction.\n\
                    Solutions:\n\
                    1. Recreate the project using 'make_project' command (recommended)\n\
                    2. Provide base asset manually with: -b <path/to/{}>",
                    project.version,
                    file.file_name.replace(".json", ".uasset")
                ));
            }
            return Err(format!(
                "No base asset path for '{}'. Use -b <base.uasset>",
                file.file_name
            ));
        };

        // Convert base to JSON
        println!("{}  Converting base asset to JSON...", "[CLI]".cyan());
        let json_path = convert_uasset_to_json(&base_path, &usmap_path)?;

        // Apply entries
        println!(
            "{}  Applying {} entries...",
            "[CLI]".cyan(),
            file.entries.len().to_string().bright_white()
        );
        apply_entries_to_json(&json_path, &file.entries)?;

        // Determine output path - ensure .uasset extension
        let output_filename = file.file_name.replace(".json", ".uasset");
        let output_uasset = output_dir.join(&output_filename);

        // Convert back to uasset
        println!("{}  Converting to uasset...", "[CLI]".cyan());
        convert_json_to_uasset(&json_path, &output_uasset, &usmap_path)?;

        println!(
            "{}  Created: {}",
            "[CLI]".cyan(),
            output_uasset.to_string_lossy().green()
        );
        output_uassets.push(output_uasset);
    }

    println!(
        "{} {}",
        "[CLI]".cyan(),
        "Applied project successfully!".green().bold()
    );
    println!(
        "{}  Created {} uasset file(s) in {}",
        "[CLI]".cyan(),
        output_uassets.len().to_string().green(),
        output_dir.to_string_lossy().bright_white()
    );

    Ok(output_uassets)
}

/// Ensure mod name has _9999999_P suffix for proper load priority
fn ensure_mod_suffix(name: &str) -> String {
    if name.ends_with("_9999999_P") {
        name.to_string()
    } else {
        format!("{}_9999999_P", name)
    }
}

/// apply_project_pak: Apply .rstp and create IoStore pak
pub fn cmd_apply_project_pak(args: &CliArgs, settings: &AppSettings) -> Result<(), String> {
    // First, apply the project to get the modded uassets
    let modded_uassets = cmd_apply_project(args, settings)?;

    if modded_uassets.is_empty() {
        return Err("No uasset files were created".to_string());
    }

    // Determine output pak path
    let output_pak = if let Some(ref out) = args.output_path {
        let out_path = PathBuf::from(out);

        // Check if it's a full path (has parent directory) or just a name
        let is_just_name = out_path
            .parent()
            .map(|p| p.as_os_str().is_empty())
            .unwrap_or(true);

        if is_just_name {
            // Just a name provided - save in Paks/~mods folder like GUI
            if let Some(ref paks_path) = settings.rivals_pak_path {
                let mod_name = ensure_mod_suffix(&out_path.with_extension("").to_string_lossy());
                PathBuf::from(paks_path).join("~mods").join(mod_name)
            } else {
                return Err(
                    "Rivals Paks path not configured. Use full path with -o or configure settings."
                        .to_string(),
                );
            }
        } else {
            // Full path provided - add suffix to filename
            let file_name = out_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("mod");
            let mod_name = ensure_mod_suffix(file_name);

            if let Some(parent) = out_path.parent() {
                parent.join(mod_name)
            } else {
                PathBuf::from(mod_name)
            }
        }
    } else {
        // Default name based on project
        let project_name = PathBuf::from(&args.input_paths[0])
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("mod")
            .to_string();

        let mod_name = ensure_mod_suffix(&project_name);

        // Use rivals pak path if available
        if let Some(ref paks_path) = settings.rivals_pak_path {
            PathBuf::from(paks_path).join("~mods").join(mod_name)
        } else {
            ensure_temp_dir()?.join(mod_name)
        }
    };

    // Ensure parent directory exists
    if let Some(parent) = output_pak.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
    }

    println!("{} Creating IoStore pak...", "[CLI]".cyan());
    create_mod_iostore(&output_pak, &modded_uassets)?;

    println!(
        "{} {}",
        "[CLI]".cyan(),
        "Pak created successfully!".green().bold()
    );
    println!(
        "{}  Output: {}",
        "[CLI]".cyan(),
        format!("{}.utoc/.ucas/.pak", output_pak.display()).green()
    );

    Ok(())
}

// ============================================================================
// HELP TEXT
// ============================================================================

pub fn print_help() {
    println!("Rivals ST Editor - CLI Mode");
    println!();
    println!("Usage: rivals-st-editor.exe <command> [options]");
    println!();
    println!("Commands:");
    println!("  make_project      Create .rstp project from uasset/json files");
    println!("  apply_project     Apply .rstp project to create modded uasset files");
    println!("  apply_project_pak Apply .rstp project and create IoStore pak");
    println!("  help              Show this help message");
    println!();
    println!("Options:");
    println!("  -i, --input <files...>   Input file(s) or glob patterns (e.g., folder/*.json)");
    println!("  -o, --output <path>      Output path");
    println!("  -b, --base <uasset>      Base vanilla uasset path (for apply commands)");
    println!("  -a, --auto-extract       Auto-extract base assets from game paks (requires");
    println!("                           Rivals Paks path configured in settings.json)");
    println!("  -m, --usmap <path>       Override usmap path (else uses settings.json)");
    println!();
    println!("Examples:");
    println!();
    println!("  Create a project from uasset files:");
    println!("    rivals-st-editor.exe make_project -i ST_CharacterMeta.uasset -o mymod.rstp");
    println!();
    println!("  Create a project from multiple files:");
    println!("    rivals-st-editor.exe make_project -i file1.uasset file2.uasset -o mymod.rstp");
    println!();
    println!("  Create a project from all JSON files in a folder:");
    println!("    rivals-st-editor.exe make_project -i \"folder/*.json\" -o mymod.rstp");
    println!();
    println!("  Apply a project (with manual base asset):");
    println!("    rivals-st-editor.exe apply_project -i mymod.rstp -b ST_CharacterMeta.uasset -o ./output/");
    println!();
    println!("  Apply a project (with auto-extract from game paks):");
    println!("    rivals-st-editor.exe apply_project -i mymod.rstp --auto-extract -o ./output/");
    println!();
    println!("  Apply and pack directly to game mods folder:");
    println!("    rivals-st-editor.exe apply_project_pak -i mymod.rstp --auto-extract -o MyMod");
    println!();
    println!("Settings:");
    println!("  The CLI uses the same settings.json as the GUI app.");
    println!("  Location: {}", get_settings_path().display());
    println!("  Run the GUI app first to configure usmap and game paths.");
}

// ============================================================================
// MAIN CLI ENTRY POINT
// ============================================================================

pub fn run_cli(args: Vec<String>) -> i32 {
    // Parse arguments
    let cli_args = match CliArgs::parse(args) {
        Ok(args) => args,
        Err(e) => {
            eprintln!("Error: {}", e);
            print_help();
            return 1;
        }
    };

    // Load settings
    let settings = load_settings();

    // Run command
    let result = match cli_args.command.as_str() {
        "make_project" => cmd_make_project(&cli_args, &settings),
        "apply_project" => cmd_apply_project(&cli_args, &settings).map(|_| ()),
        "apply_project_pak" => cmd_apply_project_pak(&cli_args, &settings),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        _ => {
            eprintln!("Unknown command: {}", cli_args.command);
            print_help();
            return 1;
        }
    };

    match result {
        Ok(()) => {
            println!("{} {}", "[CLI]".cyan(), "Done!".green().bold());
            0
        }
        Err(e) => {
            eprintln!("{} {}", "[CLI]".red(), format!("Error: {}", e).red().bold());
            1
        }
    }
}
