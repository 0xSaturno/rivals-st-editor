# **<img src="https://cdn.jsdelivr.net/gh/ilSaturnooooo/saturno-resourcers/saturno_logo_full-alpha-icon.png" width="28"/> Rivals ST Editor**
[![Release](https://img.shields.io/github/v/release/0xSaturno/rivals-st-editor.svg?style=flat-square)](https://github.com/0xSaturno/rivals-st-editor/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/0xSaturno/rivals-st-editor/total.svg?style=flat-square)](https://github.com/0xSaturno/rivals-st-editor/releases)
[![Issues](https://img.shields.io/github/issues/0xSaturno/rivals-st-editor.svg?style=flat-square)](https://github.com/0xSaturno/rivals-st-editor/issues)
[![CI Status](https://img.shields.io/github/actions/workflow/status/0xSaturno/rivals-st-editor/release.yml?label=CI)](https://github.com/0xSaturno/rivals-st-editor/actions)

A simple yet powerful desktop editor for batch editing StringTable assets in Marvel Rivals' mod files.

## **✨ Features**

* **Drag & Drop Import**: Load one or more `.uasset` or `.json` StringTable files via drag-and-drop or file picker.
* **Multi-File Tabs**: Work with multiple StringTable files simultaneously using a tabbed interface.
* **Inline Editing**: Edit string values directly in the table with auto-expanding text areas.
* **Search & Filter**:
  * Filter entries by key name, value text, or original translations.
  * Toggle between search modes with a single click.
* **Locres Translation Preview**: Automatically loads the game's localization data to show original in-game translations alongside each entry.
* **Project System (`.rstp`)**:
  * Export and import `.rstp` project files to save and share your StringTable modifications.
  * Version 2 projects include source asset metadata for seamless auto-extraction.
* **Save & Package**:
  * **Save Asset**: Convert your edits back to `.uasset` files ready for paking.
  * **Save & Package Mod**: One-click IoStore pak creation with automatic `_9999999_P` suffixing for correct load priority.
* **Automated Uasset Processing**: Includes UAssetTool to directly convert `.uasset` files for the editor.
* **File Collision Detection**: Smart merge dialog when dropping a file that's already loaded, showing diff stats with options to replace or merge changes.
* **CLI Support**: Full command-line interface for batch processing, project creation, and mod packaging without opening the GUI. See [CLI_USAGE.md](CLI_USAGE.md) for details.
* **Extract ST Assets from Game**: One-click extraction of vanilla StringTable assets from game paks.
* **Configurable Settings**:
  * USMAP path, locres language selection, and backup toggle.
  * Settings persist across sessions via `%APPDATA%\rivals-st-editor\settings.json`.
* **Extra App Controls**:
  * `Ctrl + Mouse scroll wheel` to scale the app UI.

## **📝 ST Editor Usage**

1. **Launch the `Rivals ST Editor.exe` app**.
2. **Configure Settings**: Set your USMAP and game path on first launch.
3. **Load your StringTable files** by dragging `.uasset` or `.json` files into the import area.
4. **Edit the string values** directly in the table. Use the search bar to find specific entries.
5. **Save your files** by clicking "Save Asset" for uasset output, or "Save & Package Mod" to create a ready-to-play pak.


### ℹ️ acknowledgements
- [UassetToolRivals](https://github.com/XzantGaming/UAssetToolRivals): included in this software as requirement for asset conversion and mod bundling
- LocresReader: included for localization data extraction, developed by [Xzant](https://github.com/XzantGaming) exclusively for this editor
