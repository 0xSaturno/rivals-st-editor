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

    // Build JSON request for interactive mode
    let request = serde_json::json!({
        "action": "export_to_json",
        "file_path": uasset_path,
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
                // UAssetTool writes JSON next to the uasset file (in data.path); move it to temp dir
                let tool_json_path = response["data"]["path"]
                    .as_str()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| uasset_path_buf.with_extension("json"));
                if tool_json_path.exists() && tool_json_path != json_path {
                    fs::rename(&tool_json_path, &json_path)
                        .or_else(|_| fs::copy(&tool_json_path, &json_path).map(|_| ()))
                        .map_err(|e| format!("Failed to move JSON to temp dir: {}", e))?;
                    let _ = fs::remove_file(&tool_json_path);
                }
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
/// Read locres data from game paks using the LocresReader tool
#[tauri::command]
async fn read_locres_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (usmap_path, paks_path) = {
        let settings = state.settings.lock().unwrap();
        (
            settings.usmap_path.clone(),
            settings.rivals_pak_path.clone(),
        )
    };

    // Validate settings
    let usmap = usmap_path.ok_or("USMAP path not configured")?;
    let paks = paks_path.ok_or("Rivals Paks path not configured")?;

    // Find LocresReader executable
    let cwd = std::env::current_dir().unwrap_or_default();

    // Try dev path first
    let dev_exe = cwd
        .join("LocresReader")
        .join("bin")
        .join("Release")
        .join("net9.0")
        .join("MarvelRivalsLocresReader.exe");

    let exe_path = if dev_exe.exists() {
        dev_exe
    } else {
        // Try publish path
        let publish_exe = cwd
            .join("LocresReader")
            .join("publish")
            .join("MarvelRivalsLocresReader.exe");

        if publish_exe.exists() {
            publish_exe
        } else {
            // Try bundled resource
            app.path()
                .resource_dir()
                .unwrap_or_default()
                .join("tools")
                .join("MarvelRivalsLocresReader.exe")
        }
    };

    if !exe_path.exists() {
        return Err(format!(
            "LocresReader not found at: {:?}. Please build it first.",
            exe_path
        ));
    }

    println!("[LocresReader] Using executable: {:?}", exe_path);
    println!("[LocresReader] USMAP: {}", usmap);
    println!("[LocresReader] Paks: {}", paks);

    // Get the selected language from settings
    let language = {
        let settings = state.settings.lock().unwrap();
        settings.locres_language.clone()
    };

    // Build JSON config
    let config = serde_json::json!({
        "UsmapPath": usmap,
        "PaksDirectory": paks,
        "LocresPath": format!("Marvel/Content/Localization/Game/{}/Game.locres", language),
    });

    let config_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    println!("[LocresReader] Config: {}", config_str);

    // Run the LocresReader
    let mut cmd = Command::new(&exe_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    // Write config to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(config_str.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Print stderr (diagnostic logs) to console
    if !stderr.is_empty() {
        println!("[LocresReader] Debug output:\n{}", stderr);
    }

    println!("[LocresReader] Stdout size: {} bytes", stdout.len());

    if !output.status.success() {
        return Err(format!(
            "LocresReader failed with exit code {:?}\nStderr: {}",
            output.status.code(),
            stderr
        ));
    }

    // Parse the JSON output
    println!("[LocresReader] Attempting to parse JSON...");
    println!(
        "[LocresReader] First 200 chars of stdout: {}",
        stdout.chars().take(200).collect::<String>()
    );

    let locres_data: serde_json::Value = match serde_json::from_str(&stdout) {
        Ok(data) => {
            println!("[LocresReader] JSON parsing successful!");
            data
        }
        Err(e) => {
            println!("[LocresReader] JSON parsing FAILED: {}", e);
            println!(
                "[LocresReader] Last 200 chars of stdout: {}",
                stdout
                    .chars()
                    .rev()
                    .take(200)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect::<String>()
            );
            return Err(format!("Failed to parse output: {}", e));
        }
    };

    println!("[LocresReader] Successfully parsed locres JSON data");

    // Show structure info
    if let Some(obj) = locres_data.as_object() {
        println!(
            "[LocresReader] Top-level keys: {:?}",
            obj.keys().collect::<Vec<_>>()
        );
        for (key, value) in obj.iter() {
            if let Some(arr) = value.as_array() {
                println!("[LocresReader]   - {}: {} entries", key, arr.len());
            } else if let Some(inner_obj) = value.as_object() {
                println!("[LocresReader]   - {}: {} keys", key, inner_obj.len());
            } else {
                println!("[LocresReader]   - {}: {:?}", key, value);
            }
        }
    }

    println!(
        "[LocresReader] Data preview (first 500 chars):\n{}",
        serde_json::to_string_pretty(&locres_data)
            .unwrap_or_default()
            .chars()
            .take(500)
            .collect::<String>()
    );

    Ok(locres_data)
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
