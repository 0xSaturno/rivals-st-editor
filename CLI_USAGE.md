# Rivals ST Editor - CLI Usage Guide

## Overview

The Rivals ST Editor includes a powerful command-line interface (CLI) for batch processing StringTable mods. The CLI mode allows you to automate mod creation, apply projects, and package mods without opening the GUI.

## Prerequisites

1. **UAssetTool.exe** - Must be present in the tools directory or development path
2. **Settings Configuration** - Configure paths using the GUI first or manually edit `settings.json`
   - Location: `%APPDATA%\rivals-st-editor\settings.json` (Windows)
   - Required settings:
     - `usmap_path`: Path to Mappings.usmap file
     - `rivals_pak_path`: Path to game's Paks directory (required for `--auto-extract`)

## Commands

### 1. `make_project`

Create a `.rstp` project file from uasset or JSON files.

**Syntax:**
```bash
rivals-st-editor.exe make_project -i <input_files...> -o <output.rstp>
```

**Options:**
- `-i, --input <files...>` - One or more uasset or JSON files to include in the project
- `-o, --output <path>` - Output path for the .rstp project file
- `-m, --usmap <path>` - (Optional) Override usmap path from settings

**Examples:**
```bash
# Create project from single file
rivals-st-editor.exe make_project -i ST_CharacterMeta.uasset -o mymod.rstp

# Create project from multiple files
rivals-st-editor.exe make_project -i ST_CharacterMeta.uasset ST_SkinMeta.uasset -o mymod.rstp

# Use custom usmap
rivals-st-editor.exe make_project -i ST_CharacterMeta.uasset -o mymod.rstp -m "C:\path\to\custom.usmap"
```

**Output:**
- Creates a `.rstp` project file containing:
  - All StringTable entries from input files
  - Source asset metadata (file names, game paths)
  - Table namespaces

---

### 2. `apply_project`

Apply a `.rstp` project to create modded uasset files.

**Syntax:**
```bash
rivals-st-editor.exe apply_project -i <project.rstp> [options]
```

**Options:**
- `-i, --input <file>` - Input .rstp project file
- `-o, --output <path>` - Output directory for modded uasset files (default: temp directory)
- `-b, --base <uasset>` - Base vanilla uasset file to modify
- `-a, --auto-extract` - Automatically extract base assets from game paks
- `-m, --usmap <path>` - (Optional) Override usmap path from settings

**Examples:**
```bash
# Apply with manual base asset
rivals-st-editor.exe apply_project -i mymod.rstp -b ST_CharacterMeta.uasset -o ./output/

# Apply with auto-extract (recommended)
rivals-st-editor.exe apply_project -i mymod.rstp --auto-extract -o ./output/

# Apply to temp directory (default output)
rivals-st-editor.exe apply_project -i mymod.rstp --auto-extract
```

**How it works:**
1. Loads the `.rstp` project file
2. Finds or extracts the base vanilla uasset
3. Converts base uasset to JSON
4. Applies modified entries from the project
5. Converts modified JSON back to uasset
6. Outputs modded uasset files

**Base Asset Resolution:**
The command tries to find base assets in this order:
1. User-provided `-b` path (highest priority)
2. Local path stored in the `.rstp` project file
3. Auto-extract from game paks (if `--auto-extract` is used)

---

### 3. `apply_project_pak`

Apply a `.rstp` project and create an IoStore pak file ready for the game.

**Syntax:**
```bash
rivals-st-editor.exe apply_project_pak -i <project.rstp> [options]
```

**Options:**
- `-i, --input <file>` - Input .rstp project file
- `-o, --output <name_or_path>` - Mod name or full output path
- `-b, --base <uasset>` - Base vanilla uasset file to modify
- `-a, --auto-extract` - Automatically extract base assets from game paks
- `-m, --usmap <path>` - (Optional) Override usmap path from settings

**Examples:**
```bash
# Create pak with just a name (saves to Paks/~mods folder)
rivals-st-editor.exe apply_project_pak -i mymod.rstp --auto-extract -o MyAwesomeMod

# Create pak with full path (saves to specified location)
rivals-st-editor.exe apply_project_pak -i mymod.rstp --auto-extract -o "C:\MyMods\MyAwesomeMod"

# Create pak with manual base asset
rivals-st-editor.exe apply_project_pak -i mymod.rstp -b ST_CharacterMeta.uasset -o MyAwesomeMod
```

**Output Path Behavior:**
- **Just a name** (e.g., `-o MyMod`): Saves to `<rivals_pak_path>/~mods/MyMod_9999999_P/` (requires `rivals_pak_path` configured)
- **Full path** (e.g., `-o C:\MyMods\MyMod`): Saves to the specified directory with suffix added
- **No output specified**: Uses project filename and saves to `<rivals_pak_path>/~mods/` or temp directory

**Automatic Suffix:**
The CLI automatically adds `_9999999_P` suffix to mod names if not already present. This ensures proper load priority in the game.
- `MyMod` → `MyMod_9999999_P`
- `MyMod_9999999_P` → `MyMod_9999999_P` (no change)

**Generated Files:**
- `<mod_name>_9999999_P.pak`
- `<mod_name>_9999999_P.ucas`
- `<mod_name>_9999999_P.utoc`

---

### 4. `help`

Display help information.

**Syntax:**
```bash
rivals-st-editor.exe help
rivals-st-editor.exe --help
rivals-st-editor.exe -h
```

---

## Auto-Extract Feature

The `--auto-extract` flag is a powerful feature that automatically extracts vanilla StringTable assets from the game's pak files.

**Benefits:**
- No need to manually extract base assets
- Ensures you're always using the correct vanilla asset
- Simplifies the workflow to a single command

**Requirements:**
- `rivals_pak_path` must be configured in settings.json
- The `.rstp` project must include source asset metadata (**version 2+**)

**⚠️ Important: Project Version Compatibility**

Auto-extract only works with **version 2** `.rstp` projects. If you have an older version 1 project:

1. **Recreate the project** (recommended):
   ```bash
   rivals-st-editor.exe make_project -i ST_Asset.uasset -o mymod.rstp
   ```
   Then manually copy your modified entries from the old project.

2. **Use manual base asset** (quick workaround):
   ```bash
   rivals-st-editor.exe apply_project_pak -i old_project.rstp -b ST_Asset.uasset -o MyMod
   ```

Version 2 projects include `source_paths` metadata that stores the game path needed for extraction.

**How it works:**
1. Reads the game path from the `.rstp` project (e.g., `Marvel/Content/StringTables/ST_CharacterMeta`)
2. Calls UAssetTool to extract the asset from game paks
3. Stores the extracted asset in the temp directory
4. Uses it as the base for applying modifications

---

## Workflow Examples

### Complete Mod Creation Workflow

```bash
# Step 1: Extract vanilla asset from game (one-time setup)
# This is done automatically with --auto-extract, but you can do it manually if needed

# Step 2: Create a project from the vanilla asset
rivals-st-editor.exe make_project -i ST_CharacterMeta.uasset -o character_names.rstp

# Step 3: Edit the .rstp file in a text editor or the GUI
# Modify the "value" fields to change character names, descriptions, etc.

# Step 4: Apply and package the mod
rivals-st-editor.exe apply_project_pak -i character_names.rstp --auto-extract -o CharacterNamesMod
```

### Updating an Existing Mod

```bash
# Edit your .rstp project file, then repackage
rivals-st-editor.exe apply_project_pak -i mymod.rstp --auto-extract -o MyMod_v2
```

### Testing Changes Before Packaging

```bash
# Apply to a test directory first
rivals-st-editor.exe apply_project -i mymod.rstp --auto-extract -o ./test_output/

# Inspect the generated uasset files
# Then package when ready
rivals-st-editor.exe apply_project_pak -i mymod.rstp --auto-extract -o MyMod
```

---

## Project File Format (.rstp)

The `.rstp` file is a JSON format that stores your StringTable modifications.

**Structure:**
```json
{
  "version": 2,
  "source_paths": [
    {
      "file_name": "ST_CharacterMeta.uasset",
      "game_path": "Marvel/Content/StringTables/ST_CharacterMeta",
      "local_path": "C:\\path\\to\\ST_CharacterMeta.uasset"
    }
  ],
  "files": [
    {
      "file_name": "ST_CharacterMeta.uasset",
      "table_namespace": "CharacterMeta",
      "entries": [
        {
          "key": "Character_IronMan_DisplayName",
          "value": "Iron Man (Modified)"
        },
        {
          "key": "Character_IronMan_Description",
          "value": "Custom description here"
        }
      ]
    }
  ]
}
```

**Fields:**
- `version`: Project format version (2 includes source_paths)
- `source_paths`: Metadata about original assets
  - `file_name`: Original filename
  - `game_path`: Asset path in game (used for auto-extract)
  - `local_path`: Local file path (optional)
- `files`: Array of StringTable files
  - `file_name`: Output filename
  - `table_namespace`: StringTable namespace
  - `entries`: Key-value pairs to modify

---

## Troubleshooting

### "UAssetTool not found"
- Ensure UAssetTool.exe is in the correct location
- Check development paths or bundled tools directory

### "Rivals Paks path not configured"
- Run the GUI app and configure the path in settings
- Or manually edit `settings.json` and add `"rivals_pak_path": "C:\\path\\to\\Marvel\\Paks"`

### "Base asset not found"
- Use `--auto-extract` flag to extract from game paks
- Or provide the base asset manually with `-b <path>`

### "Failed to parse project file"
- Ensure the `.rstp` file is valid JSON
- Check for syntax errors (missing commas, brackets, etc.)

### "No StringTable export found in JSON"
- The input file may not be a StringTable asset
- Verify you're using the correct asset type

---

## Settings File

**Location:** `%APPDATA%\rivals-st-editor\settings.json`

**Example:**
```json
{
  "usmap_path": "C:\\Modding\\Mappings.usmap",
  "rivals_pak_path": "C:\\Program Files\\Marvel Rivals\\MarvelGame\\Content\\Paks",
  "locres_language": "en",
  "enable_backup": true
}
```

**Fields:**
- `usmap_path`: Path to Mappings.usmap file (required)
- `rivals_pak_path`: Path to game's Paks directory (required for auto-extract)
- `locres_language`: Language for localization (default: "en")
- `enable_backup`: Create backups when modifying files (default: true)

---

## Tips & Best Practices

1. **Use Auto-Extract**: The `--auto-extract` flag simplifies your workflow significantly
2. **Version Control**: Keep your `.rstp` files in version control (Git, etc.)
3. **Descriptive Names**: Use clear mod names for easy identification
4. **Test First**: Use `apply_project` to test before creating paks
5. **Backup**: Keep backups of your `.rstp` projects
6. **Batch Processing**: Create scripts to process multiple mods at once

---

## Advanced Usage

### Batch Processing Multiple Mods

Create a batch script to process multiple mods:

```batch
@echo off
echo Building all mods...

rivals-st-editor.exe apply_project_pak -i character_names.rstp --auto-extract -o CharacterNames
rivals-st-editor.exe apply_project_pak -i skin_names.rstp --auto-extract -o SkinNames
rivals-st-editor.exe apply_project_pak -i descriptions.rstp --auto-extract -o Descriptions

echo All mods built successfully!
pause
```

### PowerShell Script Example

```powershell
$mods = @("character_names", "skin_names", "descriptions")

foreach ($mod in $mods) {
    Write-Host "Building $mod..."
    & "rivals-st-editor.exe" apply_project_pak -i "$mod.rstp" --auto-extract -o $mod
}

Write-Host "All mods built!"
```

---

## Exit Codes

- `0` - Success
- `1` - Error (check error message for details)

---

## Support

For issues, questions, or feature requests, please refer to the main project documentation or repository.
