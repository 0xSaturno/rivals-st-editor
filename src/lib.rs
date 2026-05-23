use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tokio::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// CLI module for command-line interface
pub mod cli;

// ============================================================================
// STATE & TYPES
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub usmap_path: Option<String>,
    pub rivals_pak_path: Option<String>,
    #[serde(default)]
    pub content_root_path: Option<String>,
    #[serde(default = "default_locres_language")]
    pub locres_language: String,
    #[serde(default = "default_enable_backup")]
    pub enable_backup: bool,
}

fn default_locres_language() -> String {
    "en".to_string()
}

fn default_enable_backup() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            usmap_path: None,
            rivals_pak_path: None,
            content_root_path: None,
            locres_language: "en".to_string(),
            enable_backup: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsmapMeta {
    pub file_name: String,
    pub file_path: String,
    pub fetched_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsmapStatus {
    pub installed: bool,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub needs_update: bool,
    pub latest_remote: Option<String>,
    pub auto_managed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConversionResult {
    pub success: bool,
    pub json_path: Option<String>,
    pub error: Option<String>,
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

pub fn get_settings_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("rivals-st-editor")
        .join("settings.json")
}

/// Get the temp directory for storing converted JSON files
pub fn get_temp_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("rivals-st-editor")
        .join("temp")
}

fn get_usmap_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("rivals-st-editor")
        .join("mappings")
}

fn get_usmap_meta_path() -> PathBuf {
    get_usmap_dir().join("latest.json")
}

async fn fetch_latest_usmap_filename() -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/SpaceDepot/rivals-depot/contents/usmap")
        .header("User-Agent", "rivals-st-editor")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch usmap listing: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned HTTP {}",
            response.status()
        ));
    }

    let entries: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub API response: {}", e))?;

    // Find the file with the highest build number
    // Files look like: 5.3.2-3312577+++depot_marvel+S7.5_release-Marvel.usmap
    // We extract the build number (e.g., 3312577) and pick the highest
    let mut best: Option<(u64, String)> = None;

    for entry in &entries {
        if let Some(name) = entry.get("name").and_then(|v| v.as_str()) {
            if !name.ends_with(".usmap") {
                continue;
            }
            // Skip PY_ prefixed files (PlayTest/Preview builds)
            if name.starts_with("PY_") {
                continue;
            }
            // Extract build number: "5.3.2-{number}+++"
            if let Some(after_dash) = name.strip_prefix("5.3.2-") {
                if let Some(plus_idx) = after_dash.find("+++") {
                    if let Ok(build_num) = after_dash[..plus_idx].parse::<u64>() {
                        if best.as_ref().map_or(true, |(b, _)| build_num > *b) {
                            best = Some((build_num, name.to_string()));
                        }
                    }
                }
            }
        }
    }

    best.map(|(_, name)| name)
        .ok_or_else(|| "No usmap files found in repository".to_string())
}


/// Generate a unique temp JSON path for a uasset file
fn get_temp_json_path(uasset_path: &PathBuf) -> PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let temp_dir = get_temp_dir();

    // Create a hash of the full path to ensure uniqueness
    let mut hasher = DefaultHasher::new();
    uasset_path.to_string_lossy().hash(&mut hasher);
    let path_hash = hasher.finish();

    // Get the original filename without extension
    let stem = uasset_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    // Create filename: originalname_hash.json
    let json_filename = format!("{}_{:x}.json", stem, path_hash);

    temp_dir.join(json_filename)
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        let settings = AppSettings::default();
        let _ = save_settings(&settings);
        settings
    }
}

fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn get_new_uasset_tool_path(app: &AppHandle) -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_default();

    // Dev debug path (UAssetTool - New Structure)
    let dev_tool_path = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Debug")
        .join("net8.0")
        .join("win-x64")
        .join("UAssetTool.exe");

    if dev_tool_path.exists() {
        println!(
            "[DEBUG] Resolved New UAssetTool path (Debug): {:?}",
            dev_tool_path
        );
        return dev_tool_path;
    }

    // Dev release path (non-publish - from `dotnet build`)
    let release_build_path = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Release")
        .join("net8.0")
        .join("win-x64")
        .join("UAssetTool.exe");

    if release_build_path.exists() {
        println!(
            "[DEBUG] Resolved New UAssetTool path (Release Build): {:?}",
            release_build_path
        );
        return release_build_path;
    }

    // Dev release path (publish - from `dotnet publish`)
    let release_publish_path = cwd
        .join("UassetToolRivals")
        .join("src")
        .join("UAssetTool")
        .join("bin")
        .join("Release")
        .join("net8.0")
        .join("win-x64")
        .join("publish")
        .join("UAssetTool.exe");

    if release_publish_path.exists() {
        println!(
            "[DEBUG] Resolved New UAssetTool path (Release Publish): {:?}",
            release_publish_path
        );
        return release_publish_path;
    }

    // Bundled resource path
    let bundled = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("tools")
        .join("UAssetTool.exe");

    if bundled.exists() {
        println!("[DEBUG] Resolved Bundled UAssetTool path: {:?}", bundled);
        return bundled;
    }

    println!(
        "[ERROR] New UAssetTool not found at expected location: {:?}",
        dev_tool_path
    );
    // Fallback to what? For now, maybe just return the missing path so it errors out clearly if used
    dev_tool_path
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
fn get_settings(state: State<AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_usmap_path(path: String, state: State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.usmap_path = Some(path);
    save_settings(&settings)
}

#[tauri::command]
fn set_rivals_pak_path(path: String, state: State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.rivals_pak_path = Some(path);
    save_settings(&settings)
}

#[tauri::command]
fn set_locres_language(language: String, state: State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.locres_language = language;
    save_settings(&settings)
}

#[tauri::command]
fn set_enable_backup(enable: bool, state: State<AppState>) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.enable_backup = enable;
    save_settings(&settings)
}

#[tauri::command]
async fn convert_uasset_to_json(
    app: AppHandle,
    uasset_path: String,
    state: State<'_, AppState>,
) -> Result<ConversionResult, String> {
    let uasset_path_buf = PathBuf::from(&uasset_path);

    if !uasset_path_buf.exists() {
        return Ok(ConversionResult {
            success: false,
            json_path: None,
            error: Some(format!("File not found: {}", uasset_path)),
        });
    }

    let (usmap_path, enable_backup) = {
        let settings = state.settings.lock().unwrap();
        (settings.usmap_path.clone(), settings.enable_backup)
    };

    // Use the new UassetTool which supports StringTable UTF properly
    let tool_path = get_new_uasset_tool_path(&app);

    // Create backups of .uasset and .uexp files before conversion (if enabled)
    if enable_backup {
        // New backup format: .backup.uasset instead of .uasset.backup
        let parent = uasset_path_buf
            .parent()
            .unwrap_or(std::path::Path::new("."));
        let stem = uasset_path_buf
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let uasset_backup_path = parent.join(format!("{}.backup.uasset", stem));

        if !uasset_backup_path.exists() {
            fs::copy(&uasset_path_buf, &uasset_backup_path)
                .map_err(|e| format!("Failed to create .uasset backup: {}", e))?;
            println!("[Backup] Created: {:?}", uasset_backup_path);
        }

        // Also backup the .uexp file if it exists
        let uexp_path = uasset_path_buf.with_extension("uexp");
        if uexp_path.exists() {
            let uexp_backup_path = parent.join(format!("{}.backup.uexp", stem));
            if !uexp_backup_path.exists() {
                fs::copy(&uexp_path, &uexp_backup_path)
                    .map_err(|e| format!("Failed to create .uexp backup: {}", e))?;
                println!("[Backup] Created: {:?}", uexp_backup_path);
            }
        }
    }

    // Output JSON to temp folder instead of next to the uasset file
    let json_path = get_temp_json_path(&uasset_path_buf);

    // Ensure temp directory exists
    let temp_dir = get_temp_dir();
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }

    // Copy uasset (and .uexp if present) to temp dir so UAssetTool never writes
    // next to the original files (which could overwrite user's JSON files)
    let temp_uasset = temp_dir.join(uasset_path_buf.file_name().unwrap_or_default());
    fs::copy(&uasset_path_buf, &temp_uasset)
        .map_err(|e| format!("Failed to copy uasset to temp dir: {}", e))?;
    let uexp_path = uasset_path_buf.with_extension("uexp");
    if uexp_path.exists() {
        let temp_uexp = temp_dir.join(uexp_path.file_name().unwrap_or_default());
        fs::copy(&uexp_path, &temp_uexp)
            .map_err(|e| format!("Failed to copy uexp to temp dir: {}", e))?;
    }

    // Build JSON request for interactive mode
    let request = serde_json::json!({
        "action": "export_to_json",
        "file_path": temp_uasset.to_string_lossy(),
        "usmap_path": usmap_path,
        "output_path": json_path.to_string_lossy()
    });

    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    // Write request to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(request_str.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;

    // Parse response
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        eprintln!("[UAssetTool Debug Output]\n{}", stderr);
    }

    if output.status.success() {
        // Parse JSON response
        if let Ok(response) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if response["success"].as_bool().unwrap_or(false) {
                // UAssetTool may write JSON next to the temp uasset; move it to expected path
                let tool_json_path = response["data"]["path"]
                    .as_str()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| temp_uasset.with_extension("json"));
                if tool_json_path.exists() && tool_json_path != json_path {
                    fs::rename(&tool_json_path, &json_path)
                        .or_else(|_| fs::copy(&tool_json_path, &json_path).map(|_| ()))
                        .map_err(|e| format!("Failed to move JSON to temp dir: {}", e))?;
                    let _ = fs::remove_file(&tool_json_path);
                }

                // Clean up temp uasset/uexp copies
                let _ = fs::remove_file(&temp_uasset);
                let temp_uexp = temp_uasset.with_extension("uexp");
                let _ = fs::remove_file(&temp_uexp);

                Ok(ConversionResult {
                    success: true,
                    json_path: Some(json_path.to_string_lossy().to_string()),
                    error: None,
                })
            } else {
                Ok(ConversionResult {
                    success: false,
                    json_path: None,
                    error: Some(
                        response["message"]
                            .as_str()
                            .unwrap_or("Unknown error")
                            .to_string(),
                    ),
                })
            }
        } else {
            Ok(ConversionResult {
                success: false,
                json_path: None,
                error: Some(format!("Failed to parse response: {}", stdout)),
            })
        }
    } else {
        Ok(ConversionResult {
            success: false,
            json_path: None,
            error: Some(format!("{}\n{}", stdout, stderr)),
        })
    }
}

#[tauri::command]
async fn convert_json_to_uasset(
    app: AppHandle,
    json_path: String,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<ConversionResult, String> {
    // Use the new UassetTool which supports StringTable UTF properly
    let tool_path = get_new_uasset_tool_path(&app);

    let usmap_path = {
        let settings = state.settings.lock().unwrap();
        settings.usmap_path.clone()
    };

    // Read JSON data
    let json_data = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;

    // Build JSON request for interactive mode
    let request = serde_json::json!({
        "action": "import_from_json",
        "file_path": output_path,
        "usmap_path": usmap_path,
        "json_data": json_data
    });

    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    // Write request to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        stdin
            .write_all(request_str.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;

    // Parse response
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        eprintln!("[UAssetTool Debug Output]\n{}", stderr);
    }

    if output.status.success() {
        // Parse JSON response
        if let Ok(response) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if response["success"].as_bool().unwrap_or(false) {
                Ok(ConversionResult {
                    success: true,
                    json_path: Some(output_path.clone()),
                    error: None,
                })
            } else {
                Ok(ConversionResult {
                    success: false,
                    json_path: None,
                    error: Some(
                        response["message"]
                            .as_str()
                            .unwrap_or("Unknown error")
                            .to_string(),
                    ),
                })
            }
        } else {
            Ok(ConversionResult {
                success: false,
                json_path: None,
                error: Some(format!("Failed to parse response: {}", stdout)),
            })
        }
    } else {
        Ok(ConversionResult {
            success: false,
            json_path: None,
            error: Some(format!("{}\n{}", stdout, stderr)),
        })
    }
}

#[tauri::command]
async fn create_mod_pak(
    app: AppHandle,
    uasset_paths: Vec<String>,
    mod_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let tool_path = get_new_uasset_tool_path(&app);

    let rivals_pak_path = {
        let settings = state.settings.lock().unwrap();
        settings.rivals_pak_path.clone()
    }
    .ok_or("Rivals Paks path not set. Please configure it in settings.")?;

    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    // Create ~mods folder if it doesn't exist
    let mods_dir = std::path::Path::new(&rivals_pak_path).join("~mods");
    if !mods_dir.exists() {
        std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    // Construct output base path: rivals_pak_path / ~mods / mod_name
    let output_base = mods_dir.join(&mod_name).to_string_lossy().to_string();

    // Command format: UAssetTool create_mod_iostore <OutputBase> <UAssetPath1> [UAssetPath2] ...
    cmd.arg("create_mod_iostore").arg(&output_base);

    for path in uasset_paths {
        cmd.arg(path);
    }

    let output = cmd.output().await.map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(mods_dir.to_string_lossy().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("Failed to create PAK:\n{}\n{}", stdout, stderr))
    }
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_temp_folder() -> Result<(), String> {
    let temp_dir = get_temp_dir();
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    open_folder(temp_dir.to_string_lossy().to_string()).await
}

/// Get the temp JSON path for a given uasset file
/// This allows the frontend to write edited JSON to the correct temp location
#[tauri::command]
fn get_temp_json_path_for_uasset(uasset_path: String) -> Result<String, String> {
    let uasset_path_buf = PathBuf::from(&uasset_path);
    let json_path = get_temp_json_path(&uasset_path_buf);

    // Ensure temp directory exists
    let temp_dir = get_temp_dir();
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }

    Ok(json_path.to_string_lossy().to_string())
}
/// Read locres data from game paks using UAssetTool's native locres support.
/// Extracts Game.locres from `pakchunkLocres-Windows.pak` via `extract_pak`,
/// then parses it via `parse_locres`.
#[tauri::command]
async fn read_locres_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (paks_path, language) = {
        let settings = state.settings.lock().unwrap();
        (
            settings.rivals_pak_path.clone(),
            settings.locres_language.clone(),
        )
    };

    let paks = paks_path.ok_or("Rivals Paks path not configured")?;
    let tool_path = get_new_uasset_tool_path(&app);
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    println!("[LocresRead] UAssetTool: {:?}", tool_path);
    println!("[LocresRead] Paks: {}", paks);
    println!("[LocresRead] Language: {}", language);

    // Temp dir for extracted locres
    let locres_temp = get_temp_dir().join("locres");
    fs::create_dir_all(&locres_temp)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Locres lives in a dedicated pak
    let locres_pak = PathBuf::from(&paks).join("pakchunkLocres-Windows.pak");
    if !locres_pak.exists() {
        return Err(format!(
            "Locres pak not found: {:?}. Ensure the Rivals Paks path is correct.",
            locres_pak
        ));
    }

    let locres_filter = "Game.locres";
    // Default Marvel Rivals AES key (same as extract_iostore_legacy default)
    let aes_key = "0C263D8C22DCB085894899C3A3796383E9BF9DE0CBFB08C9BF2DEF2E84F29D74";

    println!("[LocresRead] Extracting from: {:?}", locres_pak);

    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("extract_pak")
        .arg(&locres_pak)
        .arg(&locres_temp)
        .arg("--filter")
        .arg(locres_filter)
        .arg("--aes")
        .arg(aes_key)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let extract_out = cmd.output().await.map_err(|e| e.to_string())?;
    let extract_stderr = String::from_utf8_lossy(&extract_out.stderr);
    if !extract_stderr.is_empty() {
        println!("[LocresRead] extract_pak stderr:\n{}", extract_stderr);
    }
    if !extract_out.status.success() {
        return Err(format!("extract_pak failed (code {:?}):\n{}", extract_out.status.code(), extract_stderr));
    }

    let locres_file = find_locres_file(&locres_temp, &language).ok_or_else(|| {
        format!(
            "Game.locres for language '{}' not found after extraction.",
            language
        )
    })?;

    println!("[LocresRead] Parsing: {:?}", locres_file);

    // Parse with UAT's native FTextLocalizationResource
    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("parse_locres")
        .arg(&locres_file)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        println!("[LocresRead] parse_locres: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "parse_locres failed with code {:?}\nStderr: {}",
            output.status.code(),
            stderr
        ));
    }

    println!("[LocresRead] Stdout size: {} bytes", stdout.len());

    // Clean up extracted files
    let _ = fs::remove_dir_all(&locres_temp);

    let locres_data: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse locres JSON: {}", e))?;

    println!("[LocresRead] Successfully loaded locres data");
    Ok(locres_data)
}

/// Recursively search `dir` for a `Game.locres` file, preferring a parent
/// directory whose name matches `language` exactly.
fn find_locres_file(dir: &PathBuf, language: &str) -> Option<PathBuf> {
    find_locres_walk(dir, language, true)
        .or_else(|| find_locres_walk(dir, language, false))
}

fn find_locres_walk(dir: &PathBuf, language: &str, exact_lang: bool) -> Option<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_locres_walk(&path, language, exact_lang) {
                return Some(found);
            }
        } else if path.file_name().and_then(|n| n.to_str()) == Some("Game.locres") {
            if exact_lang {
                let parent = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if parent.eq_ignore_ascii_case(language) {
                    return Some(path);
                }
            } else {
                return Some(path);
            }
        }
    }
    None
}

/// Extract all StringTable assets from game paks using UAssetTool extract_iostore_legacy
#[tauri::command]
async fn extract_string_tables(
    app: AppHandle,
    output_dir: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let paks_path = {
        let settings = state.settings.lock().unwrap();
        settings.rivals_pak_path.clone()
    }
    .ok_or("Rivals Paks path not set. Please configure it in settings.")?;

    let tool_path = get_new_uasset_tool_path(&app);
    if !tool_path.exists() {
        return Err(format!("UAssetTool not found at: {:?}", tool_path));
    }

    let output_path = PathBuf::from(&output_dir);
    fs::create_dir_all(&output_path)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    println!("[ExtractST] Extracting StringTables from: {}", paks_path);
    println!("[ExtractST] Output: {}", output_dir);

    let mut cmd = Command::new(&tool_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("extract_iostore_legacy")
        .arg(&paks_path)
        .arg(&output_dir)
        .arg("--filter")
        .arg("Marvel/Data/StringTable/")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run UAssetTool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    println!("[ExtractST] stdout: {}", stdout);
    if !stderr.is_empty() {
        println!("[ExtractST] stderr: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!("Extraction failed:\n{}\n{}", stdout, stderr));
    }

    Ok(output_dir)
}

#[tauri::command]
async fn check_usmap_status(state: State<'_, AppState>) -> Result<UsmapStatus, String> {
    let settings_usmap = {
        let settings = state.settings.lock().unwrap();
        settings.usmap_path.clone()
    };

    let meta_path = get_usmap_meta_path();
    let meta: Option<UsmapMeta> = if meta_path.exists() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
    } else {
        None
    };

    // Determine if current usmap is auto-managed (lives in our managed dir)
    let managed_dir = get_usmap_dir();
    let auto_managed = settings_usmap
        .as_ref()
        .map(|p| std::path::Path::new(p).starts_with(&managed_dir))
        .unwrap_or(false);

    // Check if usmap file actually exists
    let installed = settings_usmap
        .as_ref()
        .map(|p| std::path::Path::new(p).exists())
        .unwrap_or(false);

    // Try to fetch latest remote filename
    let latest_remote = fetch_latest_usmap_filename().await.ok();

    let needs_update = if let (Some(ref remote), Some(ref m)) = (&latest_remote, &meta) {
        *remote != m.file_name
    } else if latest_remote.is_some() && meta.is_none() {
        true
    } else {
        false
    };

    Ok(UsmapStatus {
        installed,
        file_name: meta.as_ref().map(|m| m.file_name.clone()).or_else(|| {
            settings_usmap.as_ref().and_then(|p| {
                std::path::Path::new(p).file_name().map(|f| f.to_string_lossy().to_string())
            })
        }),
        file_path: settings_usmap,
        needs_update,
        latest_remote,
        auto_managed,
    })
}

#[tauri::command]
async fn fetch_latest_usmap(state: State<'_, AppState>) -> Result<UsmapStatus, String> {
    let file_name = fetch_latest_usmap_filename().await?;
    let download_url = format!(
        "https://raw.githubusercontent.com/SpaceDepot/rivals-depot/main/usmap/{}",
        file_name
    );

    println!("[DEBUG] Downloading usmap: {}", download_url);

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("Failed to download usmap: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download usmap: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read usmap data: {}", e))?;

    let usmap_dir = get_usmap_dir();
    fs::create_dir_all(&usmap_dir).map_err(|e| format!("Failed to create mappings dir: {}", e))?;

    let usmap_path = usmap_dir.join(&file_name);
    fs::write(&usmap_path, &bytes).map_err(|e| format!("Failed to write usmap file: {}", e))?;

    // Save metadata
    let meta = UsmapMeta {
        file_name: file_name.clone(),
        file_path: usmap_path.to_string_lossy().to_string(),
        fetched_at: chrono::Utc::now().to_rfc3339(),
    };
    let meta_json =
        serde_json::to_string_pretty(&meta).map_err(|e| format!("Failed to serialize meta: {}", e))?;
    fs::write(get_usmap_meta_path(), meta_json)
        .map_err(|e| format!("Failed to write meta file: {}", e))?;

    // Update app settings to point to the new usmap
    let usmap_path_str = usmap_path.to_string_lossy().to_string();
    {
        let mut settings = state.settings.lock().unwrap();
        settings.usmap_path = Some(usmap_path_str.clone());
        save_settings(&settings).map_err(|e| format!("Failed to save settings: {}", e))?;
    }

    println!("[DEBUG] Usmap installed: {} -> {:?}", file_name, usmap_path);

    Ok(UsmapStatus {
        installed: true,
        file_name: Some(file_name),
        file_path: Some(usmap_path_str),
        needs_update: false,
        latest_remote: None,
        auto_managed: true,
    })
}


// ============================================================================
// APP INITIALIZATION
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = load_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            settings: Mutex::new(settings),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_usmap_path,
            set_rivals_pak_path,
            set_locres_language,
            set_enable_backup,
            convert_uasset_to_json,
            convert_json_to_uasset,
            create_mod_pak,
            open_folder,
            open_temp_folder,
            get_temp_json_path_for_uasset,
            read_locres_data,
            extract_string_tables,
            check_usmap_status,
            fetch_latest_usmap,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let temp_dir = get_temp_dir();
                if temp_dir.exists() {
                    let _ = fs::remove_dir_all(&temp_dir);
                }
            }
        });
}
