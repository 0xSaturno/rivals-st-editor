export interface Entry {
    id: string;
    key: string;
    value: string;
    originalIndex: number;
}

export interface FileData {
    fileName: string;
    originalJson: any;
    entries: Entry[];
    exportIndex: number;
    tableNamespace: string;
    uassetPath: string | null;
    gamePath: string;
}

export interface Settings {
    usmapPath: string | null;
    rivalsPakPath?: string | null;
    locresLanguage: string;
    enableBackup: boolean;
}

export interface ChangedEntry {
    key: string;
    oldValue: string;
    newValue: string;
}

export interface DiffStats {
    changed: number;
    unchanged: number;
    newKeys: number;
    missingKeys: number;
    changedEntries: ChangedEntry[];
}

export interface DropCollision {
    droppedFile: FileData;
    existingIndex: number;
    diffStats: DiffStats;
}

export type SearchMode = 'keys' | 'values' | 'subtitles';

export type LocresData = Record<string, Record<string, string>> | null;

export interface UsmapStatus {
    installed: boolean;
    file_name: string | null;
    file_path: string | null;
    needs_update: boolean;
    latest_remote: string | null;
    auto_managed: boolean;
}

