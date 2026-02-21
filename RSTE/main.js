const { useState, useEffect, useRef, useMemo, useCallback } = React;
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open: openDialog } = window.__TAURI__.dialog;

// Particles component for header
const Particles = () => {
    const particles = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 150; i++) {
            const size = Math.random() * 2.5 + 0.5;
            const duration = 5 + Math.random() * 10;
            arr.push(<div key={i} className="particle" style={{
                width: `${size}px`, height: `${size}px`,
                left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                animationDelay: `-${Math.random() * duration}s`, animationDuration: `${duration}s`
            }}></div>);
        }
        return arr;
    }, []);
    return <div className="particles">{particles}</div>;
};

// StyledPanel component with customizable overflow
const StyledPanel = ({ title, children, className, maxHeight = 'calc(100vh - 360px)', overflow = 'auto', ...props }) => (
    <div className={`relative group ${className || ''}`} style={{ backgroundColor: 'var(--bg-3)' }} {...props}>
        <div className="absolute inset-0 border-2 pointer-events-none transition-colors" style={{ borderColor: 'var(--bg-2)' }}></div>
        <div className="absolute inset-0 border-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderColor: 'var(--accent-main)' }}></div>
        <h2 className="absolute -top-3 left-4 px-2 text-xl font-medium" style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}>
            <span className="transition-colors group-hover:text-[--accent-main]">{title}</span>
        </h2>
        <div className={`p-6 pt-8 ${overflow === 'auto' ? 'overflow-y-auto' : ''}`} style={{ maxHeight, overflow: overflow !== 'auto' ? overflow : undefined }}>{children}</div>
    </div>
);

// Main App
function App() {
    const [filesData, setFilesData] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState(null);
    const [globalSaveStatus, setGlobalSaveStatus] = useState(null);
    const [projectName, setProjectName] = useState('MyPreset');
    const [isConverting, setIsConverting] = useState(false);
    const [settings, setSettings] = useState({ usmapPath: null, locresLanguage: 'en', enableBackup: true });
    const [showSettings, setShowSettings] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState('keys'); // 'keys', 'values', or 'subtitles'
    const [showPakNameInput, setShowPakNameInput] = useState(false);
    const [modPakName, setModPakName] = useState('');
    const [locresData, setLocresData] = useState(null);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isLoadingLocres, setIsLoadingLocres] = useState(false);
    const [dropCollision, setDropCollision] = useState(null); // { droppedFile, existingIndex, diffStats }
    const [isExtracting, setIsExtracting] = useState(false);


    const directoryHandleRef = useRef(null);
    const projectFileInputRef = useRef(null);
    const filesDataRef = useRef(filesData);

    // Reset button animation refs
    const resetTimerRef = useRef(null);
    const resetButtonRef = useRef(null);
    const animationFrameRef = useRef(null);
    const pressStartTimeRef = useRef(null);

    // Reset button handlers
    const handleResetPress = () => {
        pressStartTimeRef.current = Date.now();
        animationFrameRef.current = requestAnimationFrame(shakeEffect);
        resetTimerRef.current = setTimeout(() => {
            clearAll();
            cancelAnimationFrame(animationFrameRef.current);
            if (resetButtonRef.current) {
                resetButtonRef.current.style.transform = 'translate(0, 0)';
            }
        }, 2000);
    };

    const handleResetRelease = () => {
        clearTimeout(resetTimerRef.current);
        cancelAnimationFrame(animationFrameRef.current);
        if (resetButtonRef.current) {
            resetButtonRef.current.style.transform = 'translate(0, 0)';
        }
    };

    const shakeEffect = () => {
        if (!resetButtonRef.current || !pressStartTimeRef.current) return;
        const elapsedTime = Date.now() - pressStartTimeRef.current;
        const progress = Math.min(elapsedTime / 2000, 1);
        const maxIntensity = 4;
        const currentIntensity = maxIntensity * progress;
        const x = (Math.random() - 0.5) * 2 * currentIntensity;
        const y = (Math.random() - 0.5) * 2 * currentIntensity;
        resetButtonRef.current.style.transform = `translate(${x}px, ${y}px)`;
        animationFrameRef.current = requestAnimationFrame(shakeEffect);
    };

    // Disable right click context menu
    useEffect(() => {
        const handleContextMenu = (e) => e.preventDefault();
        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    // Load settings on mount
    useEffect(() => {
        invoke('get_settings').then(loadedSettings => {
            // Ensure default values if not set
            setSettings({
                ...loadedSettings,
                locresLanguage: loadedSettings.locresLanguage || 'en',
                enableBackup: loadedSettings.enableBackup !== false // default to true
            });
        }).catch(console.error);
    }, []);

    useEffect(() => { filesDataRef.current = filesData; }, [filesData]);

    // Handle Tauri drag-drop events
    useEffect(() => {
        let unlistenDrop, unlistenEnter, unlistenLeave;

        const setup = async () => {
            unlistenEnter = await listen('tauri://drag-enter', () => setIsDragging(true));
            unlistenLeave = await listen('tauri://drag-leave', () => setIsDragging(false));
            unlistenDrop = await listen('tauri://drag-drop', async (event) => {
                setIsDragging(false);
                const paths = event.payload.paths || event.payload;
                if (!paths?.length) return;

                const { readTextFile } = window.__TAURI__.fs;

                for (const path of paths) {
                    const name = path.split(/[\\/]/).pop();
                    let parsed = null;

                    if (name.endsWith('.uasset')) {
                        const currentSettings = await invoke('get_settings');
                        if (!currentSettings.usmapPath) {
                            setError('USMAP file not configured! Please set the USMAP path in Settings before loading .uasset files.');
                            setShowSettings(true);
                            return;
                        }

                        setIsConverting(true);
                        try {
                            const result = await invoke('convert_uasset_to_json', { uassetPath: path });
                            if (result.success && result.json_path) {
                                const content = await readTextFile(result.json_path);
                                parsed = processFileContent(name.replace('.uasset', '.json'), content, path);
                                if (!locresData) await loadLocresData();
                            } else {
                                setError(`Conversion failed: ${result.error}`);
                            }
                        } catch (e) {
                            setError(`Error: ${e}`);
                        }
                        setIsConverting(false);
                    } else if (name.endsWith('.json')) {
                        try {
                            const content = await readTextFile(path);
                            parsed = processFileContent(name, content, null);
                        } catch (e) {
                            setError(`Error reading ${name}: ${e}`);
                        }
                    }

                    if (!parsed) continue;

                    const droppedBase = stripExtension(parsed.fileName);
                    const currentFiles = filesDataRef.current;
                    const existingIndex = currentFiles.findIndex(fd => stripExtension(fd.fileName) === droppedBase);

                    if (existingIndex === -1) {
                        setFilesData(prev => [...prev, parsed]);
                    } else {
                        const diffStats = computeDiffStats(currentFiles[existingIndex].entries, parsed.entries);
                        setDropCollision({ droppedFile: parsed, existingIndex, diffStats });
                    }
                }
            });
        };
        setup();

        return () => {
            if (unlistenDrop) unlistenDrop();
            if (unlistenEnter) unlistenEnter();
            if (unlistenLeave) unlistenLeave();
        };
    }, []);

    // =========================================================================
    // STRINGTABLE PARSING LOGIC
    // Parses StringTableExport format:
    // - Exports[].Table.Value is an array of [key, value] pairs
    // =========================================================================

    const findStringTableExport = (json) => {
        if (!json?.Exports) return null;

        for (let i = 0; i < json.Exports.length; i++) {
            const exp = json.Exports[i];

            // Check if this is a StringTableExport
            if (exp?.["$type"]?.includes("StringTableExport") && exp?.Table?.Value) {
                return {
                    exportIndex: i,
                    tableNamespace: exp.Table.TableNamespace || '',
                    valueArray: exp.Table.Value
                };
            }
        }
        return null;
    };

    // Infer game path from uasset path
    const inferGamePath = (uassetPath, fileName) => {
        if (!uassetPath) {
            // Fallback: use filename without extension
            const baseName = fileName.replace(/\.(uasset|json)$/i, '');
            return `Marvel/Content/StringTables/${baseName}`;
        }

        const pathStr = uassetPath.replace(/\\/g, '/');
        // Look for Marvel/Content in the path
        const idx = pathStr.indexOf('Marvel/Content');
        if (idx !== -1) {
            const gamePath = pathStr.substring(idx);
            // Remove .uasset extension
            return gamePath.replace(/\.uasset$/i, '');
        }

        // Fallback
        const baseName = fileName.replace(/\.(uasset|json)$/i, '');
        return `Marvel/Content/StringTables/${baseName}`;
    };

    const processFileContent = (fileName, content, uassetPath) => {
        try {
            const json = JSON.parse(content);
            const result = findStringTableExport(json);

            if (!result) {
                throw new Error(`No StringTableExport found in ${fileName}. This file may not be a valid StringTable asset.`);
            }

            // Parse the StringTable Value array: each entry is [key, value]
            const entries = result.valueArray.map((pair, idx) => ({
                id: crypto.randomUUID(),
                key: pair[0] || '',
                value: pair[1] || '',
                originalIndex: idx
            }));

            return {
                fileName,
                originalJson: json,
                entries,
                exportIndex: result.exportIndex,
                tableNamespace: result.tableNamespace,
                uassetPath,
                gamePath: inferGamePath(uassetPath, fileName)
            };
        } catch (e) {
            setError(`Error in ${fileName}: ${e.message}`);
            return null;
        }
    };

    // Helper function to load locres data
    const loadLocresData = useCallback(async () => {
        setIsLoadingLocres(true);
        try {
            console.log('[LocresReader] Fetching locres data...');
            const data = await invoke('read_locres_data');
            console.log('[LocresReader] Success! Data loaded');
            setLocresData(data);
        } catch (locresErr) {
            console.error('[LocresReader] Failed:', locresErr);
            setError(`Failed to load locres data: ${locresErr}`);
        } finally {
            setIsLoadingLocres(false);
        }
    }, []);

    const handleFileLoad = (files) => {
        setError(null);
        Array.from(files).filter(f => f.name.endsWith('.json')).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const parsed = processFileContent(file.name, e.target.result, null);
                if (parsed) setFilesData(prev => [...prev, parsed]);
            };
            reader.readAsText(file);
        });
    };

    const handleSelectUsmapFile = async () => {
        const path = await openDialog({ filters: [{ name: 'USMAP', extensions: ['usmap'] }], title: 'Select .usmap file' });
        if (path) {
            await invoke('set_usmap_path', { path });
            setSettings(prev => ({ ...prev, usmapPath: path }));
        }
    };

    const handleSelectRivalsPakPath = async () => {
        const path = await openDialog({ directory: true, title: 'Select Rivals "Paks" Folder' });
        if (path) {
            await invoke('set_rivals_pak_path', { path });
            setSettings(prev => ({ ...prev, rivalsPakPath: path }));
        }
    };

    const handleCreateModPak = async () => {
        if (!filesData.some(f => f.uassetPath)) {
            alert("No loaded .uasset files to package.");
            return;
        }
        if (!settings.rivalsPakPath) {
            alert("Please set the Rivals Mods Path in settings first.");
            setShowSettings(true);
            return;
        }

        // Show the name input popover
        // Default name to the first file's name (without extension)
        const firstFile = filesData.find(f => f.uassetPath);
        if (firstFile && !modPakName) {
            setModPakName(firstFile.fileName.replace(/\.(uasset|json)$/i, ''));
        }
        setShowPakNameInput(true);
    };

    const confirmCreateModPak = async () => {
        setShowPakNameInput(false);
        if (!modPakName.trim()) return;

        setGlobalSaveStatus('Saving assets...');
        try {
            // First, save all uasset files with current modifications
            for (const fileData of filesData) {
                if (fileData.uassetPath) {
                    const newJson = JSON.parse(JSON.stringify(fileData.originalJson));

                    // Rebuild the StringTable Value array from entries
                    newJson.Exports[fileData.exportIndex].Table.Value = fileData.entries.map(entry => [
                        entry.key,
                        entry.value
                    ]);

                    // Write JSON to temp folder and convert back to uasset
                    const jsonPath = await invoke('get_temp_json_path_for_uasset', { uassetPath: fileData.uassetPath });
                    await window.__TAURI__.fs.writeTextFile(jsonPath, JSON.stringify(newJson, null, 2));
                    const result = await invoke('convert_json_to_uasset', { jsonPath, outputPath: fileData.uassetPath });
                    if (!result.success) {
                        setGlobalSaveStatus(`Error saving: ${result.error}`);
                        setTimeout(() => setGlobalSaveStatus(null), 5000);
                        return;
                    }
                }
            }

            setGlobalSaveStatus('Packaging...');
            const uassetPaths = filesData
                .filter(f => f.uassetPath)
                .map(f => f.uassetPath);

            if (uassetPaths.length === 0) {
                setGlobalSaveStatus('No uassets to package.');
                setTimeout(() => setGlobalSaveStatus(null), 5000);
                return;
            }

            // Append standard suffix
            const finalModName = `${modPakName}_9999999_P`;

            const modsPath = await invoke('create_mod_pak', { uassetPaths, modName: finalModName });
            setGlobalSaveStatus('Mod Packaged!');
            await invoke('open_folder', { path: modsPath });

        } catch (e) {
            setGlobalSaveStatus(`Error packaging: ${e}`);
        }
        setTimeout(() => setGlobalSaveStatus(null), 5000);
    };

    const handleSaveAll = async () => {
        setGlobalSaveStatus('Saving...');
        try {
            for (const fileData of filesData) {
                const newJson = JSON.parse(JSON.stringify(fileData.originalJson));

                // Rebuild the StringTable Value array from entries
                newJson.Exports[fileData.exportIndex].Table.Value = fileData.entries.map(entry => [
                    entry.key,
                    entry.value
                ]);

                // If came from uasset, write JSON to temp folder and convert back
                if (fileData.uassetPath) {
                    const jsonPath = await invoke('get_temp_json_path_for_uasset', { uassetPath: fileData.uassetPath });
                    await window.__TAURI__.fs.writeTextFile(jsonPath, JSON.stringify(newJson, null, 2));
                    const result = await invoke('convert_json_to_uasset', { jsonPath, outputPath: fileData.uassetPath });
                    if (!result.success) {
                        setGlobalSaveStatus(`Error: ${result.error}`);
                        return;
                    }
                } else {
                    // Browser file save for JSON-only files
                    if (!directoryHandleRef.current) {
                        directoryHandleRef.current = await window.showDirectoryPicker();
                    }
                    const fileHandle = await directoryHandleRef.current.getFileHandle(fileData.fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(newJson, null, 2));
                    await writable.close();
                }
            }
            setGlobalSaveStatus('Saved successfully!');
        } catch (err) {
            setGlobalSaveStatus(err.name === 'AbortError' ? 'Cancelled' : `Error: ${err.message}`);
        }
        setTimeout(() => setGlobalSaveStatus(null), 5000);
    };

    // =========================================================================
    // PROJECT SAVE/LOAD (.rstp format)
    // =========================================================================

    const handleExportPreset = async () => {
        if (!filesData.length) return alert("No file loaded.");

        // Export all entries from all loaded files (Version 2 format)
        const preset = {
            version: 2,
            sourcePaths: filesData.map(fd => ({
                fileName: fd.fileName,
                gamePath: fd.gamePath || `Marvel/Content/StringTables/${fd.fileName.replace(/\.(uasset|json)$/i, '')}`,
                localPath: fd.uassetPath || null
            })),
            files: filesData.map(fd => ({
                fileName: fd.fileName,
                tableNamespace: fd.tableNamespace,
                entries: fd.entries.map(e => ({ key: e.key, value: e.value }))
            }))
        };

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${projectName}.rstp`,
                types: [{ description: 'ST Preset', accept: { 'application/json': ['.rstp'] } }]
            });
            const w = await handle.createWritable();
            await w.write(JSON.stringify(preset, null, 2));
            await w.close();
        } catch (e) { if (e.name !== 'AbortError') alert(`Export failed: ${e.message}`); }
    };

    const handleImportPreset = () => projectFileInputRef.current.click();

    const onPresetFileSelected = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);

                // Handle both old format (just array) and new format (object with version)
                let presetEntries = [];
                if (Array.isArray(data)) {
                    // Old format: flat array of {key, value}
                    presetEntries = data;
                } else if (data.files && Array.isArray(data.files)) {
                    // New format: collect all entries from all files
                    presetEntries = data.files.flatMap(f => f.entries || []);
                } else if (data.entries && Array.isArray(data.entries)) {
                    // Alternative format: single entries array
                    presetEntries = data.entries;
                } else {
                    throw new Error("Invalid preset format");
                }

                // Apply preset values to matching keys across all loaded files
                setFilesData(prev => prev.map(f => ({
                    ...f,
                    entries: f.entries.map(entry => {
                        const presetEntry = presetEntries.find(p => p.key === entry.key);
                        return presetEntry ? { ...entry, value: presetEntry.value } : entry;
                    })
                })));
            } catch (err) { alert(`Import failed: ${err.message}`); }
        };
        reader.readAsText(file);
        e.target.value = null;
    };

    const stripExtension = (name) => name.replace(/\.(uasset|json)$/i, '');

    const computeDiffStats = (existingEntries, droppedEntries) => {
        const droppedMap = new Map(droppedEntries.map(e => [e.key, e.value]));
        const existingMap = new Map(existingEntries.map(e => [e.key, e.value]));
        let changed = 0, unchanged = 0, newKeys = 0, missingKeys = 0;
        const changedEntries = [];

        for (const [key, value] of droppedMap) {
            if (existingMap.has(key)) {
                if (existingMap.get(key) !== value) {
                    changed++;
                    changedEntries.push({ key, oldValue: existingMap.get(key), newValue: value });
                } else {
                    unchanged++;
                }
            } else {
                newKeys++;
            }
        }
        for (const key of existingMap.keys()) {
            if (!droppedMap.has(key)) missingKeys++;
        }
        return { changed, unchanged, newKeys, missingKeys, changedEntries };
    };



    const handleCollisionOpenNewTab = () => {
        if (!dropCollision) return;
        setFilesData(prev => [...prev, dropCollision.droppedFile]);
        setActiveTabIndex(filesData.length);
        setDropCollision(null);
    };

    const handleCollisionMerge = () => {
        if (!dropCollision) return;
        const { droppedFile, existingIndex } = dropCollision;
        const droppedMap = new Map(droppedFile.entries.map(e => [e.key, e.value]));
        setFilesData(prev => prev.map((f, i) => {
            if (i !== existingIndex) return f;
            return {
                ...f,
                entries: f.entries.map(entry => {
                    const newValue = droppedMap.get(entry.key);
                    return newValue !== undefined ? { ...entry, value: newValue } : entry;
                })
            };
        }));
        setActiveTabIndex(existingIndex);
        setDropCollision(null);
    };

    const handleCollisionReplace = () => {
        if (!dropCollision) return;
        const { droppedFile, existingIndex } = dropCollision;
        setFilesData(prev => prev.map((f, i) => i === existingIndex ? droppedFile : f));
        setActiveTabIndex(existingIndex);
        setDropCollision(null);
    };

    const clearAll = () => { setFilesData([]); setError(null); setGlobalSaveStatus(null); directoryHandleRef.current = null; setModPakName(''); setActiveTabIndex(0); };
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileLoad(e.dataTransfer.files); };
    const handleFileChange = (e) => handleFileLoad(e.target.files);
    const updateFileEntries = (idx, entries) => setFilesData(prev => { const n = [...prev]; n[idx].entries = entries; return n; });

    const handleExtractStringTables = async () => {
        const currentSettings = await invoke('get_settings');
        if (!currentSettings.rivalsPakPath) {
            setError('Rivals Paks path not configured. Please set it in Settings first.');
            setShowSettings(true);
            return;
        }
        // Ask user where to save
        const { open } = window.__TAURI__.dialog;
        const folder = await open({ directory: true, title: 'Choose where to extract StringTables' });
        if (!folder) return;

        setIsExtracting(true);
        setError(null);
        try {
            const outputDir = await invoke('extract_string_tables', { outputDir: folder });
            await invoke('open_folder', { path: outputDir });
            setGlobalSaveStatus('StringTables extracted!');
            setTimeout(() => setGlobalSaveStatus(null), 5000);
        } catch (e) {
            setError(`Extraction failed: ${e}`);
        }
        setIsExtracting(false);
    };

    // Filter entries based on search query and mode
    const getFilteredEntries = (entries, tableNamespace) => {
        if (!searchQuery.trim()) return entries;
        const query = searchQuery.toLowerCase();
        return entries.filter(e => {
            if (searchMode === 'keys') return e.key.toLowerCase().includes(query);
            if (searchMode === 'values') return e.value.toLowerCase().includes(query);
            if (searchMode === 'subtitles') {
                // Search in original translations
                if (!locresData || !tableNamespace) return false;
                const namespaceData = locresData[tableNamespace];
                if (!namespaceData) return false;
                const originalTranslation = namespaceData[e.key];
                return originalTranslation && originalTranslation.toLowerCase().includes(query);
            }
            return false;
        });
    };

    return (
        <div className="p-4 md:p-8">
            <header className="relative group p-4 border-2 particle-header mb-8" style={{ borderColor: 'var(--bg-2)', userSelect: 'none' }}>
                <Particles />
                <div className="absolute inset-0 border-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderColor: 'var(--accent-main)', zIndex: 2 }}></div>
                <div className="flex justify-between items-center w-full relative" style={{ zIndex: 1 }}>
                    <div className="flex items-center gap-4">
                        <img src="./assets/saturn-logo.svg" alt="Logo" className="h-24 filter brightness-0 invert" />
                        <div className="flex items-baseline gap-3">
                            <h1 className="text-5xl font-normal" style={{ color: 'var(--text-1)' }}>Rivals ST Editor</h1>
                            <h2 className="text-1xl font-medium" style={{ color: 'var(--text-4)' }}>v0.8.3</h2>
                        </div>
                    </div>
                    <div className="flex flex-col items-end" style={{ gap: '3rem' }}>
                        <div className="flex gap-2">
                            <button onClick={() => setShowSettings(true)} className="hover:text-[var(--accent-main)] transition-colors p-1" style={{ color: 'var(--text-3)' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            </button>
                            <button
                                ref={resetButtonRef}
                                title="Hold 2s to Reset"
                                className="hover:text-[var(--accent-main)] transition-colors p-1"
                                style={{ color: 'var(--text-3)' }}
                                onMouseDown={handleResetPress}
                                onMouseUp={handleResetRelease}
                                onMouseLeave={handleResetRelease}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-4)' }}>by Saturn</span>
                    </div>
                </div>
            </header>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                    <div className="p-6 max-w-lg w-full" style={{ backgroundColor: 'var(--bg-3)', border: '2px solid var(--bg-2)' }}>
                        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>Settings</h2>
                        <div className="mb-4">
                            <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>Rivals Paks Path</label>
                            <div className="flex gap-2">
                                <input type="text" readOnly value={settings.rivalsPakPath || 'Not set'}
                                    className="flex-1 px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--bg-1)' }} />
                                <button onClick={handleSelectRivalsPakPath} className="btn btn-primary text-sm">Browse</button>
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>USMAP File Path</label>
                            <div className="flex gap-2">
                                <input type="text" readOnly value={settings.usmapPath || 'Not set'}
                                    className="flex-1 px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--bg-1)' }} />
                                <button onClick={handleSelectUsmapFile} className="btn btn-primary text-sm">Browse</button>
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>
                                Locres Language {isLoadingLocres && <span style={{ color: 'var(--accent-main)' }}>(Loading...)</span>}
                            </label>
                            <select
                                value={settings.locresLanguage || 'en'}
                                disabled={isLoadingLocres}
                                onChange={async (e) => {
                                    const newLanguage = e.target.value;
                                    // Update state immediately for UI responsiveness
                                    setSettings(prev => ({ ...prev, locresLanguage: newLanguage }));
                                    // Save to backend
                                    try {
                                        await invoke('set_locres_language', { language: newLanguage });
                                        // If there are files loaded with uasset paths, reload locres data with new language
                                        if (filesData.some(f => f.uassetPath)) {
                                            console.log(`[LocresReader] Language changed to ${newLanguage}, reloading locres data...`);
                                            await loadLocresData();
                                        } else {
                                            // No files loaded, just clear the data
                                            setLocresData(null);
                                        }
                                    } catch (err) {
                                        console.error('Failed to save language setting:', err);
                                    }
                                }}
                                className="w-full px-3 py-2 text-sm"
                                style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--bg-1)', opacity: isLoadingLocres ? 0.6 : 1 }}
                            >
                                <option value="ar">Arabic (ar)</option>
                                <option value="de">German (de)</option>
                                <option value="en">English (en)</option>
                                <option value="es-419">Spanish - Latin America (es-419)</option>
                                <option value="es-ES">Spanish - Spain (es-ES)</option>
                                <option value="fr">French (fr)</option>
                                <option value="it">Italian (it)</option>
                                <option value="ja">Japanese (ja)</option>
                                <option value="ko">Korean (ko)</option>
                                <option value="pl">Polish (pl)</option>
                                <option value="pt-BR">Portuguese - Brazil (pt-BR)</option>
                                <option value="ru">Russian (ru)</option>
                                <option value="th">Thai (th)</option>
                                <option value="tr">Turkish (tr)</option>
                                <option value="zh-Hans">Chinese - Simplified (zh-Hans)</option>
                                <option value="zh-Hans-CN">Chinese - Simplified CN (zh-Hans-CN)</option>
                                <option value="zh-Hant">Chinese - Traditional (zh-Hant)</option>
                            </select>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>Advanced</label>
                            <div className="mb-3 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="enableBackup"
                                    checked={settings.enableBackup !== false}
                                    onChange={async (e) => {
                                        const enabled = e.target.checked;
                                        setSettings(prev => ({ ...prev, enableBackup: enabled }));
                                        try {
                                            await invoke('set_enable_backup', { enable: enabled });
                                        } catch (err) {
                                            console.error('Failed to save backup setting:', err);
                                        }
                                    }}
                                    className="cursor-pointer"
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <label htmlFor="enableBackup" className="text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                                    Create uasset backups on import
                                </label>
                            </div>
                            <button
                                onClick={() => invoke('open_temp_folder')}
                                className="btn btn-secondary text-sm w-full"
                                style={{ border: '1px solid var(--bg-1)' }}
                            >
                                Open Temp Folder
                            </button>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={() => setShowSettings(false)} className="btn btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drop Collision Dialog */}
            {dropCollision && (
                <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                    <div className="p-6 flex flex-col" style={{ backgroundColor: 'var(--bg-3)', border: '2px solid var(--accent-main)', width: '80%', height: '80%', maxWidth: '80vw', maxHeight: '80vh' }}>
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-1)' }}>File Already Open</h2>
                        <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
                            <span style={{ color: 'var(--accent-main)' }}>{stripExtension(dropCollision.droppedFile.fileName)}</span> is already loaded.
                            <br />
                            What would you like to do?
                        </p>

                        <div className="mb-4 p-3" style={{ backgroundColor: 'var(--bg-2)', border: '1px solid var(--bg-1)' }}>
                            <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-2)' }}>Diff Summary</div>
                            <div className="flex gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
                                <span>{dropCollision.diffStats.changed} <span style={{ color: 'var(--accent-main)' }}>changed</span></span>
                                <span>{dropCollision.diffStats.unchanged} unchanged</span>
                                <span>{dropCollision.diffStats.newKeys} <span style={{ color: '#4ade80' }}>new</span></span>
                                <span>{dropCollision.diffStats.missingKeys} <span style={{ color: '#f87171' }}>missing</span></span>
                            </div>
                        </div>

                        {dropCollision.diffStats.changedEntries.length > 0 && (
                            <div className="mb-4 overflow-auto flex-1" style={{ border: '1px solid var(--bg-1)', minHeight: 0 }}>
                                <table className="text-xs" style={{ minWidth: '100%' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr style={{ backgroundColor: 'var(--bg-2)' }}>
                                            <th className="text-left px-2 py-1" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Key</th>
                                            <th className="text-left px-2 py-1" style={{ color: '#f87171', whiteSpace: 'nowrap' }}>Current</th>
                                            <th className="text-left px-2 py-1" style={{ color: '#4ade80', whiteSpace: 'nowrap' }}>Incoming</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dropCollision.diffStats.changedEntries.map((d, i) => (
                                            <tr key={i} style={{ borderTop: '1px solid var(--bg-1)' }}>
                                                <td className="px-2 py-1" style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{d.key}</td>
                                                <td className="px-2 py-1" style={{ color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 200 }}>{d.oldValue}</td>
                                                <td className="px-2 py-1" style={{ color: '#4ade80', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 200 }}>{d.newValue}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => setDropCollision(null)} className="btn btn-secondary text-sm">Cancel</button>
                            <div className="flex-grow"></div>
                            <button onClick={handleCollisionOpenNewTab} className="btn btn-secondary text-sm" style={{ border: '1px solid var(--accent-main)' }}>Open in New Tab</button>
                            <button onClick={handleCollisionReplace} className="btn btn-secondary text-sm" style={{ border: '1px solid #f87171' }}>Replace Tab</button>
                            <button onClick={handleCollisionMerge} className="btn btn-primary text-sm">Merge Values ({dropCollision.diffStats.changed})</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Converting overlay */}
            {isConverting && (
                <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="p-8 text-center" style={{ backgroundColor: 'var(--bg-3)', border: '2px solid var(--accent-main)' }}>
                        <div className="text-xl" style={{ color: 'var(--text-1)' }}>Converting...</div>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-800 border border-red-600 text-white px-4 py-3 mb-6">
                    <strong>Error!</strong> {error}
                </div>
            )}

            {filesData.length === 0 ? (
                <StyledPanel title="Load Files">
                    <div className="text-center py-20 px-6 border-2 border-dashed transition-colors"
                        style={{ backgroundColor: 'var(--bg-2)', borderColor: isDragging ? 'var(--accent-main)' : 'var(--bg-1)' }}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                            <svg className="mx-auto h-12 w-12" style={{ color: 'var(--text-4)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <div className="flex items-center gap-2 mt-2">
                                <h3 className="text-lg font-medium" style={{ color: 'var(--text-2)' }}>No files loaded</h3>
                                <img src="./assets/images/shrug.png" alt="shrug" className="h-6 w-6" />
                            </div>
                            <p className="mt-1 text-sm" style={{ color: 'var(--text-4)' }}>Drag & drop .json or .uasset StringTable files here</p>
                            <input type='file' className="hidden" multiple accept=".json,.uasset" onChange={handleFileChange} />
                        </label>
                    </div>
                    <div className="flex justify-center mt-4">
                        <button
                            onClick={handleExtractStringTables}
                            disabled={isExtracting}
                            className="btn btn-secondary text-sm flex items-center gap-2"
                            style={{ border: '1px solid var(--accent-main)', opacity: isExtracting ? 0.6 : 1 }}
                        >
                            {isExtracting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                                    </svg>
                                    Extracting...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Extract String Tables from Game
                                </>
                            )}
                        </button>
                    </div>
                </StyledPanel>
            ) : (
                <div className="space-y-8">
                    <StyledPanel title="Project Management" overflow="visible" maxHeight="none">
                        <div className="flex items-center gap-3 flex-wrap">
                            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="table-input" style={{ width: '200px' }} placeholder="Project Name" />
                            <span className="text-sm" style={{ color: 'var(--text-4)' }}>.rstp</span>
                            <button onClick={handleExportPreset} className="btn btn-secondary">Export</button>
                            <button onClick={handleImportPreset} className="btn btn-secondary">Import</button>
                            <input type="file" ref={projectFileInputRef} className="hidden" accept=".rstp" onChange={onPresetFileSelected} />
                            <div className="flex-grow"></div>
                            {globalSaveStatus && <span className="text-sm" style={{ color: 'var(--text-4)' }}>{globalSaveStatus}</span>}
                            <div className="relative">
                                <button onClick={handleCreateModPak} className="btn btn-info">Save & Package Mod</button>
                                {showPakNameInput && (
                                    <div className="absolute bottom-full right-0 mb-2 p-3 z-50 shadow-xl" style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--accent-cyan)', width: '320px' }}>
                                        <label className="block text-xs mb-1" style={{ color: 'var(--text-2)' }}>Mod Name:</label>
                                        <div className="flex items-center gap-1 mb-2">
                                            <input
                                                type="text"
                                                value={modPakName}
                                                onChange={(e) => setModPakName(e.target.value)}
                                                className="table-input text-sm flex-1"
                                                style={{ minWidth: 0 }}
                                                autoFocus
                                                onKeyDown={(e) => e.key === 'Enter' && confirmCreateModPak()}
                                            />
                                            <div style={{ color: 'var(--text-4)', whiteSpace: 'nowrap' }} className="text-sm select-none">
                                                _9999999_P
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => setShowPakNameInput(false)} className="btn text-xs" style={{ padding: '2px 8px', backgroundColor: 'var(--bg-1)' }}>Cancel</button>
                                            <button onClick={confirmCreateModPak} className="btn btn-info text-xs" style={{ padding: '2px 8px' }}>Create</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleSaveAll} className="btn btn-success">Save Asset</button>
                        </div>
                    </StyledPanel>
                    {/* Tab Bar */}
                    {filesData.length > 1 && (
                        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-2" style={{ borderBottom: '2px solid var(--bg-2)' }}>
                            {filesData.map((fileData, index) => (
                                <div
                                    key={`tab-${fileData.fileName}-${index}`}
                                    onClick={() => setActiveTabIndex(index)}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                                    style={{
                                        backgroundColor: activeTabIndex === index ? 'var(--bg-3)' : 'var(--bg-2)',
                                        color: activeTabIndex === index ? 'var(--accent-main)' : 'var(--text-3)',
                                        borderTop: activeTabIndex === index ? '2px solid var(--accent-main)' : '2px solid transparent',
                                        borderLeft: '1px solid var(--bg-1)',
                                        borderRight: '1px solid var(--bg-1)',
                                        marginBottom: '-2px'
                                    }}
                                >
                                    {fileData.fileName.replace(/\.(json|uasset)$/i, '')}
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFilesData(prev => prev.filter((_, i) => i !== index));
                                            setActiveTabIndex(prev => prev >= filesData.length - 1 ? Math.max(0, filesData.length - 2) : prev >= index ? Math.max(0, prev - 1) : prev);
                                        }}
                                        className="inline-flex items-center justify-center"
                                        style={{ width: 16, height: 16, lineHeight: '16px', fontSize: 14, opacity: 0.5, borderRadius: 2 }}
                                        onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'var(--bg-1)'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >×</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Active Editor */}
                    {filesData[activeTabIndex] && (
                        <StringTableEditor
                            key={`${filesData[activeTabIndex].fileName}-${activeTabIndex}`}
                            fileData={filesData[activeTabIndex]}
                            filteredEntries={getFilteredEntries(filesData[activeTabIndex].entries, filesData[activeTabIndex].tableNamespace)}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            searchMode={searchMode}
                            setSearchMode={setSearchMode}
                            onEntriesChange={(entries) => updateFileEntries(activeTabIndex, entries)}
                            locresData={locresData}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// StringTable editor component
function StringTableEditor({ fileData, filteredEntries, searchQuery, setSearchQuery, searchMode, setSearchMode, onEntriesChange, locresData }) {
    const handleValueChange = (entryId, newValue) => {
        onEntriesChange(fileData.entries.map(e =>
            e.id === entryId ? { ...e, value: newValue } : e
        ));
    };



    const handleKeyChange = (entryId, newKey) => {
        onEntriesChange(fileData.entries.map(e =>
            e.id === entryId ? { ...e, key: newKey } : e
        ));
    };

    // Lookup original translation from locres data
    const getOriginalTranslation = (key) => {
        if (!locresData || !fileData.tableNamespace) return null;

        // The locres data structure is: { "TableNamespace": { "Key": "Translation" } }
        const namespaceData = locresData[fileData.tableNamespace];
        if (!namespaceData) return null;

        return namespaceData[key] || null;
    };

    // Highlight search matches in text
    const highlightText = (text, query) => {
        if (!query.trim()) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
        );
    };

    return (
        <StyledPanel title={fileData.fileName.replace(/\.(json|uasset)$/i, '')}>
            <div className="flex items-center mb-4 gap-4 flex-wrap">
                <input
                    type="text"
                    className="search-box"
                    placeholder={`Search ${searchMode === 'keys' ? 'keys' : searchMode === 'values' ? 'values' : 'translations'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ maxWidth: '250px' }}
                />
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setSearchMode('keys')}
                        className={`btn text-xs ${searchMode === 'keys' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >Keys</button>
                    <button
                        onClick={() => setSearchMode('values')}
                        className={`btn text-xs ${searchMode === 'values' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >Values</button>
                    <button
                        onClick={() => setSearchMode('subtitles')}
                        className={`btn text-xs ${searchMode === 'subtitles' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >Translations</button>
                </div>
                <div className="text-sm" style={{ color: 'var(--text-4)' }}>
                    Showing {filteredEntries.length} of {fileData.entries.length} entries
                </div>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredEntries.map((entry) => {
                    const originalTranslation = getOriginalTranslation(entry.key);
                    return (
                        <div key={entry.id} className="string-entry">
                            <div className="string-key">
                                {highlightText(entry.key, searchQuery)}
                            </div>
                            <div className="string-value-container">
                                <div className="string-value-backdrop">
                                    {highlightText(entry.value, searchQuery)}
                                </div>
                                <textarea
                                    className="string-value-input"
                                    rows="1"
                                    value={entry.value}
                                    onChange={(e) => {
                                        handleValueChange(entry.id, e.target.value);
                                        e.target.style.height = '0';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    ref={(el) => {
                                        if (el) {
                                            el.style.height = '0';
                                            el.style.height = el.scrollHeight + 'px';
                                        }
                                    }}
                                />
                            </div>
                            {originalTranslation && (
                                <div style={{ marginTop: '-8px', paddingLeft: '8px', opacity: 1 }}>
                                    <span style={{ color: 'var(--text-4)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                        {searchMode === 'subtitles' ? highlightText(originalTranslation, searchQuery) : originalTranslation}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

        </StyledPanel>
    );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);
