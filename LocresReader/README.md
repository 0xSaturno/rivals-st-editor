# Locres Reader

A C# console application using CUE4Parse to read and extract `.locres` localization files from Marvel Rivals pak files.

## Features

- JSON configuration input via stdin
- Automatic Oodle decompression support
- AES key decryption for encrypted pak files
- Usmap mappings support for proper asset parsing
- Outputs locres JSON to stdout (for piping to other apps)
- All diagnostic logs go to stderr

## Building

### Prerequisites

- .NET 9.0 SDK
- `oo2core_9_win64.dll` - Download from [go-oodle releases](https://github.com/new-world-tools/go-oodle/releases/download/v0.2.1-file/oo2core_9_win64.dll)

### Build Steps

```bash
# Clone/download the source
cd LocresReader

# Restore dependencies
dotnet restore

# Build
dotnet build -c Release

# Publish (creates standalone executable)
dotnet publish -c Release -o publish

# Copy Oodle DLL to publish folder
copy oo2core_9_win64.dll publish\
```

## Usage

Send JSON configuration via stdin, receive locres JSON via stdout:

```bash
echo '{"UsmapPath": "C:\\path\\to\\usmap.usmap"}' | LocresReader.exe
```

### JSON Input Format

```json
{
  "UsmapPath": "C:\\path\\to\\usmap.usmap",
  "AesKey": "0x...",
  "PaksDirectory": "C:\\path\\to\\paks",
  "LocresPath": "Marvel/Content/Localization/Game/en/Game.locres"
}
```

All fields are optional. Defaults:
- **AES Key:** `0x0C263D8C22DCB085894899C3A3796383E9BF9DE0CBFB08C9BF2DEF2E84F29D74`
- **Paks Directory:** `E:\SteamLibrary\steamapps\common\MarvelRivals\MarvelGame\Marvel\Content\Paks`
- **Locres Path:** `Marvel/Content/Localization/Game/en/Game.locres`

### Output

- **stdout:** Compact JSON containing the locres data
- **stderr:** Diagnostic/progress messages

### Example Integration

```python
import subprocess
import json

config = {"UsmapPath": "C:\\path\\to\\usmap.usmap"}
result = subprocess.run(
    ["LocresReader.exe"],
    input=json.dumps(config),
    capture_output=True,
    text=True
)
locres_data = json.loads(result.stdout)
```

## Dependencies

- CUE4Parse (latest from NuGet)
- Newtonsoft.Json
