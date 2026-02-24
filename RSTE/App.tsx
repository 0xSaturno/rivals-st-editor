import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { FileData, Settings, DropCollision, SearchMode, LocresData, Entry } from './types';
import { processFileContent } from './utils/stringTable';
import { stripExtension, computeDiffStats } from './utils/diff';
import { useResetButton } from './hooks/useResetButton';
import { useDragDrop } from './hooks/useDragDrop';

import { Header } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { DropCollisionDialog } from './components/DropCollisionDialog';
import { ConvertingOverlay } from './components/ConvertingOverlay';
import { LoadFilesPanel } from './components/LoadFilesPanel';
import { ProjectManagement } from './components/ProjectManagement';
import { TabBar } from './components/TabBar';
import { StringTableEditor } from './components/StringTableEditor';

export function App() {
    const [filesData, setFilesData] = useState<FileData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [globalSaveStatus, setGlobalSaveStatus] = useState<string | null>(null);
    const [projectName, setProjectName] = useState('MyPreset');
    const [isConverting, setIsConverting] = useState(false);
    const [settings, setSettings] = useState<Settings>({
        usmapPath: null,
        locresLanguage: 'en',
        enableBackup: true,
    });
    const [showSettings, setShowSettings] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState<SearchMode>('keys');
    const [showPakNameInput, setShowPakNameInput] = useState(false);
    const [modPakName, setModPakName] = useState('');
    const [locresData, setLocresData] = useState<LocresData>(null);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isLoadingLocres, setIsLoadingLocres] = useState(false);
    const [dropCollision, setDropCollision] = useState<DropCollision | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
    const projectFileInputRef = useRef<HTMLInputElement>(null!);
    const filesDataRef = useRef(filesData);

    const clearAll = useCallback(() => {
        setFilesData([]);
        setError(null);
        setGlobalSaveStatus(null);
        directoryHandleRef.current = null;
        setModPakName('');
        setActiveTabIndex(0);
    }, []);

    const { resetButtonRef, handleResetPress, handleResetRelease } = useResetButton(clearAll);

    // Disable right click context menu
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    // Load settings on mount
    useEffect(() => {
        invoke<Settings>('get_settings')
            .then((loadedSettings) => {
                setSettings({
                    ...loadedSettings,
                    locresLanguage: loadedSettings.locresLanguage || 'en',
                    enableBackup: loadedSettings.enableBackup !== false,
                });
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        filesDataRef.current = filesData;
    }, [filesData]);

    // Helper function to load locres data
    const loadLocresData = useCallback(async () => {
        setIsLoadingLocres(true);
        try {
            console.log('[LocresReader] Fetching locres data...');
            const data = await invoke<Record<string, Record<string, string>>>('read_locres_data');
            console.log('[LocresReader] Success! Data loaded');
            setLocresData(data);
        } catch (locresErr) {
            console.error('[LocresReader] Failed:', locresErr);
            setError(`Failed to load locres data: ${locresErr}`);
        } finally {
            setIsLoadingLocres(false);
        }
    }, []);

    // Handle Tauri drag-drop events
    const handleDrop = useCallback(
        async (paths: string[]) => {
            for (const path of paths) {
                const name = path.split(/[\\/]/).pop()!;
                let parsed: FileData | null = null;

                if (name.endsWith('.uasset')) {
                    const currentSettings = await invoke<Settings>('get_settings');
                    if (!currentSettings.usmapPath) {
                        setError(
                            'USMAP file not configured! Please set the USMAP path in Settings before loading .uasset files.',
                        );
                        setShowSettings(true);
                        return;
                    }

                    setIsConverting(true);
                    try {
                        const result = await invoke<{ success: boolean; json_path?: string; error?: string }>(
                            'convert_uasset_to_json',
                            { uassetPath: path },
                        );
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
                const existingIndex = currentFiles.findIndex(
                    (fd) => stripExtension(fd.fileName) === droppedBase,
                );

                if (existingIndex === -1) {
                    setFilesData((prev) => [...prev, parsed!]);
                } else {
                    const diffStats = computeDiffStats(currentFiles[existingIndex].entries, parsed.entries);
                    setDropCollision({ droppedFile: parsed, existingIndex, diffStats });
                }
            }
        },
        [locresData, loadLocresData],
    );

    useDragDrop({
        onDrop: handleDrop,
        onDragChange: setIsDragging,
    });

    // File loading from browser input
    const handleFileLoad = (files: FileList) => {
        setError(null);
        Array.from(files)
            .filter((f) => f.name.endsWith('.json'))
            .forEach((file) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsed = processFileContent(file.name, e.target!.result as string, null);
                        setFilesData((prev) => [...prev, parsed]);
                    } catch (err: any) {
                        setError(err.message);
                    }
                };
                reader.readAsText(file);
            });
    };

    const handleSelectUsmapFile = async () => {
        const path = await openDialog({
            filters: [{ name: 'USMAP', extensions: ['usmap'] }],
            title: 'Select .usmap file',
        });
        if (path) {
            await invoke('set_usmap_path', { path });
            setSettings((prev) => ({ ...prev, usmapPath: path as string }));
        }
    };

    const handleSelectRivalsPakPath = async () => {
        const path = await openDialog({ directory: true, title: 'Select Rivals "Paks" Folder' });
        if (path) {
            await invoke('set_rivals_pak_path', { path });
            setSettings((prev) => ({ ...prev, rivalsPakPath: path as string }));
        }
    };

    const handleCreateModPak = async () => {
        if (!filesData.some((f) => f.uassetPath)) {
            alert('No loaded .uasset files to package.');
            return;
        }
        if (!settings.rivalsPakPath) {
            alert('Please set the Rivals Mods Path in settings first.');
            setShowSettings(true);
            return;
        }

        const firstFile = filesData.find((f) => f.uassetPath);
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
            for (const fileData of filesData) {
                if (fileData.uassetPath) {
                    const newJson = JSON.parse(JSON.stringify(fileData.originalJson));
                    newJson.Exports[fileData.exportIndex].Table.Value = fileData.entries.map(
                        (entry) => [entry.key, entry.value],
                    );

                    const jsonPath = await invoke<string>('get_temp_json_path_for_uasset', {
                        uassetPath: fileData.uassetPath,
                    });
                    await writeTextFile(jsonPath, JSON.stringify(newJson, null, 2));
                    const result = await invoke<{ success: boolean; error?: string }>(
                        'convert_json_to_uasset',
                        { jsonPath, outputPath: fileData.uassetPath },
                    );
                    if (!result.success) {
                        setGlobalSaveStatus(`Error saving: ${result.error}`);
                        setTimeout(() => setGlobalSaveStatus(null), 5000);
                        return;
                    }
                }
            }

            setGlobalSaveStatus('Packaging...');
            const uassetPaths = filesData.filter((f) => f.uassetPath).map((f) => f.uassetPath);

            if (uassetPaths.length === 0) {
                setGlobalSaveStatus('No uassets to package.');
                setTimeout(() => setGlobalSaveStatus(null), 5000);
                return;
            }

            const finalModName = `${modPakName}_9999999_P`;
            const modsPath = await invoke<string>('create_mod_pak', {
                uassetPaths,
                modName: finalModName,
            });
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
                newJson.Exports[fileData.exportIndex].Table.Value = fileData.entries.map((entry) => [
                    entry.key,
                    entry.value,
                ]);

                if (fileData.uassetPath) {
                    const jsonPath = await invoke<string>('get_temp_json_path_for_uasset', {
                        uassetPath: fileData.uassetPath,
                    });
                    await writeTextFile(jsonPath, JSON.stringify(newJson, null, 2));
                    const result = await invoke<{ success: boolean; error?: string }>(
                        'convert_json_to_uasset',
                        { jsonPath, outputPath: fileData.uassetPath },
                    );
                    if (!result.success) {
                        setGlobalSaveStatus(`Error: ${result.error}`);
                        return;
                    }
                } else {
                    if (!directoryHandleRef.current) {
                        directoryHandleRef.current = await window.showDirectoryPicker();
                    }
                    const fileHandle = await directoryHandleRef.current!.getFileHandle(
                        fileData.fileName,
                        { create: true },
                    );
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(newJson, null, 2));
                    await writable.close();
                }
            }
            setGlobalSaveStatus('Saved successfully!');
        } catch (err: any) {
            setGlobalSaveStatus(
                err.name === 'AbortError' ? 'Cancelled' : `Error: ${err.message}`,
            );
        }
        setTimeout(() => setGlobalSaveStatus(null), 5000);
    };

    // =========================================================================
    // PROJECT SAVE/LOAD (.rstp format)
    // =========================================================================

    const handleExportPreset = async () => {
        if (!filesData.length) return alert('No file loaded.');

        const preset = {
            version: 2,
            sourcePaths: filesData.map((fd) => ({
                fileName: fd.fileName,
                gamePath:
                    fd.gamePath ||
                    `Marvel/Content/StringTables/${fd.fileName.replace(/\.(uasset|json)$/i, '')}`,
                localPath: fd.uassetPath || null,
            })),
            files: filesData.map((fd) => ({
                fileName: fd.fileName,
                tableNamespace: fd.tableNamespace,
                entries: fd.entries.map((e) => ({ key: e.key, value: e.value })),
            })),
        };

        try {
            const path = await saveDialog({
                defaultPath: `${projectName}.rstp`,
                filters: [{ name: 'ST Preset', extensions: ['rstp'] }],
            });
            if (path) {
                await writeTextFile(path, JSON.stringify(preset, null, 2));
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') alert(`Export failed: ${e.message || e}`);
        }
    };

    const handleImportPreset = () => projectFileInputRef.current?.click();

    const onPresetFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target!.result as string);

                let presetEntries: { key: string; value: string }[] = [];
                if (Array.isArray(data)) {
                    presetEntries = data;
                } else if (data.files && Array.isArray(data.files)) {
                    presetEntries = data.files.flatMap(
                        (f: any) => f.entries || [],
                    );
                } else if (data.entries && Array.isArray(data.entries)) {
                    presetEntries = data.entries;
                } else {
                    throw new Error('Invalid preset format');
                }

                setFilesData((prev) =>
                    prev.map((f) => ({
                        ...f,
                        entries: f.entries.map((entry) => {
                            const presetEntry = presetEntries.find((p) => p.key === entry.key);
                            return presetEntry ? { ...entry, value: presetEntry.value } : entry;
                        }),
                    })),
                );
            } catch (err: any) {
                alert(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Collision handlers
    const handleCollisionOpenNewTab = () => {
        if (!dropCollision) return;
        setFilesData((prev) => [...prev, dropCollision.droppedFile]);
        setActiveTabIndex(filesData.length);
        setDropCollision(null);
    };

    const handleCollisionMerge = () => {
        if (!dropCollision) return;
        const { droppedFile, existingIndex } = dropCollision;
        const droppedMap = new Map(droppedFile.entries.map((e) => [e.key, e.value]));
        setFilesData((prev) =>
            prev.map((f, i) => {
                if (i !== existingIndex) return f;
                return {
                    ...f,
                    entries: f.entries.map((entry) => {
                        const newValue = droppedMap.get(entry.key);
                        return newValue !== undefined ? { ...entry, value: newValue } : entry;
                    }),
                };
            }),
        );
        setActiveTabIndex(existingIndex);
        setDropCollision(null);
    };

    const handleCollisionReplace = () => {
        if (!dropCollision) return;
        const { droppedFile, existingIndex } = dropCollision;
        setFilesData((prev) => prev.map((f, i) => (i === existingIndex ? droppedFile : f)));
        setActiveTabIndex(existingIndex);
        setDropCollision(null);
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };
    const handleBrowserDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileLoad(e.dataTransfer.files);
    };
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFileLoad(e.target.files);
    };

    const updateFileEntries = (idx: number, entries: Entry[]) =>
        setFilesData((prev) => {
            const n = [...prev];
            n[idx] = { ...n[idx], entries };
            return n;
        });

    const handleExtractStringTables = async () => {
        const currentSettings = await invoke<Settings>('get_settings');
        if (!currentSettings.rivalsPakPath) {
            setError('Rivals Paks path not configured. Please set it in Settings first.');
            setShowSettings(true);
            return;
        }
        const folder = await openDialog({
            directory: true,
            title: 'Choose where to extract StringTables',
        });
        if (!folder) return;

        setIsExtracting(true);
        setError(null);
        try {
            const outputDir = await invoke<string>('extract_string_tables', { outputDir: folder });
            await invoke('open_folder', { path: outputDir });
            setGlobalSaveStatus('StringTables extracted!');
            setTimeout(() => setGlobalSaveStatus(null), 5000);
        } catch (e) {
            setError(`Extraction failed: ${e}`);
        }
        setIsExtracting(false);
    };

    const getFilteredEntries = (entries: Entry[], tableNamespace: string): Entry[] => {
        if (!searchQuery.trim()) return entries;
        const query = searchQuery.toLowerCase();
        return entries.filter((e) => {
            if (searchMode === 'keys') return e.key.toLowerCase().includes(query);
            if (searchMode === 'values') return e.value.toLowerCase().includes(query);
            if (searchMode === 'subtitles') {
                if (!locresData || !tableNamespace) return false;
                const namespaceData = locresData[tableNamespace];
                if (!namespaceData) return false;
                const originalTranslation = namespaceData[e.key];
                return originalTranslation && originalTranslation.toLowerCase().includes(query);
            }
            return false;
        });
    };

    const handleTabClose = (index: number) => {
        setFilesData((prev) => prev.filter((_, i) => i !== index));
        setActiveTabIndex((prev) =>
            prev >= filesData.length - 1
                ? Math.max(0, filesData.length - 2)
                : prev >= index
                  ? Math.max(0, prev - 1)
                  : prev,
        );
    };

    return (
        <div className="p-4 md:p-8">
            <Header
                onShowSettings={() => setShowSettings(true)}
                resetButtonRef={resetButtonRef}
                onResetPress={handleResetPress}
                onResetRelease={handleResetRelease}
            />

            {showSettings && (
                <SettingsModal
                    settings={settings}
                    isLoadingLocres={isLoadingLocres}
                    hasLoadedFiles={filesData.some((f) => f.uassetPath)}
                    onClose={() => setShowSettings(false)}
                    onSelectUsmapFile={handleSelectUsmapFile}
                    onSelectRivalsPakPath={handleSelectRivalsPakPath}
                    onSettingsChange={setSettings}
                    onLoadLocresData={loadLocresData}
                    onClearLocresData={() => setLocresData(null)}
                />
            )}

            {dropCollision && (
                <DropCollisionDialog
                    dropCollision={dropCollision}
                    onCancel={() => setDropCollision(null)}
                    onOpenNewTab={handleCollisionOpenNewTab}
                    onReplace={handleCollisionReplace}
                    onMerge={handleCollisionMerge}
                />
            )}

            <ConvertingOverlay isConverting={isConverting} />

            {error && (
                <div className="bg-red-800 border border-red-600 text-white px-4 py-3 mb-6">
                    <strong>Error!</strong> {error}
                </div>
            )}

            {filesData.length === 0 ? (
                <LoadFilesPanel
                    isDragging={isDragging}
                    isExtracting={isExtracting}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleBrowserDrop}
                    onFileChange={handleFileChange}
                    onExtractStringTables={handleExtractStringTables}
                />
            ) : (
                <div className="space-y-8">
                    <ProjectManagement
                        projectName={projectName}
                        onProjectNameChange={setProjectName}
                        onExportPreset={handleExportPreset}
                        onImportPreset={handleImportPreset}
                        projectFileInputRef={projectFileInputRef}
                        onPresetFileSelected={onPresetFileSelected}
                        globalSaveStatus={globalSaveStatus}
                        onCreateModPak={handleCreateModPak}
                        showPakNameInput={showPakNameInput}
                        modPakName={modPakName}
                        onModPakNameChange={setModPakName}
                        onConfirmCreateModPak={confirmCreateModPak}
                        onCancelPakName={() => setShowPakNameInput(false)}
                        onSaveAll={handleSaveAll}
                    />

                    <TabBar
                        filesData={filesData}
                        activeTabIndex={activeTabIndex}
                        onTabSelect={setActiveTabIndex}
                        onTabClose={handleTabClose}
                    />

                    {filesData[activeTabIndex] && (
                        <StringTableEditor
                            key={`${filesData[activeTabIndex].fileName}-${activeTabIndex}`}
                            fileData={filesData[activeTabIndex]}
                            filteredEntries={getFilteredEntries(
                                filesData[activeTabIndex].entries,
                                filesData[activeTabIndex].tableNamespace,
                            )}
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
