import { ReactNode } from 'react';
import { Entry, FileData, LocresData, SearchMode } from '../types';
import { StyledPanel } from './StyledPanel';

interface StringTableEditorProps {
    fileData: FileData;
    filteredEntries: Entry[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchMode: SearchMode;
    setSearchMode: (mode: SearchMode) => void;
    onEntriesChange: (entries: Entry[]) => void;
    locresData: LocresData;
}

export function StringTableEditor({
    fileData,
    filteredEntries,
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    onEntriesChange,
    locresData,
}: StringTableEditorProps) {
    const handleValueChange = (entryId: string, newValue: string) => {
        onEntriesChange(
            fileData.entries.map((e) => (e.id === entryId ? { ...e, value: newValue } : e)),
        );
    };

    const getOriginalTranslation = (key: string): string | null => {
        if (!locresData || !fileData.tableNamespace) return null;
        const namespaceData = locresData[fileData.tableNamespace];
        if (!namespaceData) return null;
        return namespaceData[key] || null;
    };

    const highlightText = (text: string, query: string): ReactNode => {
        if (!query.trim()) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? (
                <mark key={i} className="search-highlight">{part}</mark>
            ) : (
                part
            ),
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
                    >
                        Keys
                    </button>
                    <button
                        onClick={() => setSearchMode('values')}
                        className={`btn text-xs ${searchMode === 'values' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >
                        Values
                    </button>
                    <button
                        onClick={() => setSearchMode('subtitles')}
                        className={`btn text-xs ${searchMode === 'subtitles' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                    >
                        Translations
                    </button>
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
                                    rows={1}
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
                                        {searchMode === 'subtitles'
                                            ? highlightText(originalTranslation, searchQuery)
                                            : originalTranslation}
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
