import type { RefObject, ChangeEvent } from 'react';
import { StyledPanel } from './StyledPanel';

interface ProjectManagementProps {
    projectName: string;
    onProjectNameChange: (name: string) => void;
    onExportPreset: () => void;
    onImportPreset: () => void;
    projectFileInputRef: RefObject<HTMLInputElement>;
    onPresetFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
    globalSaveStatus: string | null;
    onCreateModPak: () => void;
    showPakNameInput: boolean;
    modPakName: string;
    onModPakNameChange: (name: string) => void;
    onConfirmCreateModPak: () => void;
    onCancelPakName: () => void;
    onSaveAll: () => void;
}

export function ProjectManagement({
    projectName,
    onProjectNameChange,
    onExportPreset,
    onImportPreset,
    projectFileInputRef,
    onPresetFileSelected,
    globalSaveStatus,
    onCreateModPak,
    showPakNameInput,
    modPakName,
    onModPakNameChange,
    onConfirmCreateModPak,
    onCancelPakName,
    onSaveAll,
}: ProjectManagementProps) {
    return (
        <StyledPanel title="Project Management" overflow="visible" maxHeight="none">
            <div className="flex items-center gap-3 flex-wrap">
                <input
                    type="text"
                    value={projectName}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    className="table-input"
                    style={{ width: '200px' }}
                    placeholder="Project Name"
                />
                <span className="text-sm" style={{ color: 'var(--text-4)' }}>.rstp</span>
                <button onClick={onExportPreset} className="btn btn-secondary">Export</button>
                <button onClick={onImportPreset} className="btn btn-secondary">Import</button>
                <input
                    type="file"
                    ref={projectFileInputRef}
                    className="hidden"
                    accept=".rstp"
                    onChange={onPresetFileSelected}
                />
                <div className="flex-grow" />
                {globalSaveStatus && (
                    <span className="text-sm" style={{ color: 'var(--text-4)' }}>{globalSaveStatus}</span>
                )}
                <div className="relative">
                    <button onClick={onCreateModPak} className="btn btn-info">Save & Package Mod</button>
                    {showPakNameInput && (
                        <div
                            className="absolute bottom-full right-0 mb-2 p-3 z-50 shadow-xl"
                            style={{ backgroundColor: 'var(--bg-3)', border: '1px solid var(--accent-cyan)', width: '320px' }}
                        >
                            <label className="block text-xs mb-1" style={{ color: 'var(--text-2)' }}>Mod Name:</label>
                            <div className="flex items-center gap-1 mb-2">
                                <input
                                    type="text"
                                    value={modPakName}
                                    onChange={(e) => onModPakNameChange(e.target.value)}
                                    className="table-input text-sm flex-1"
                                    style={{ minWidth: 0 }}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && onConfirmCreateModPak()}
                                />
                                <div
                                    style={{ color: 'var(--text-4)', whiteSpace: 'nowrap' }}
                                    className="text-sm select-none"
                                >
                                    _9999999_P
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button onClick={onCancelPakName} className="btn text-xs" style={{ padding: '2px 8px', backgroundColor: 'var(--bg-1)' }}>Cancel</button>
                                <button onClick={onConfirmCreateModPak} className="btn btn-info text-xs" style={{ padding: '2px 8px' }}>Create</button>
                            </div>
                        </div>
                    )}
                </div>
                <button onClick={onSaveAll} className="btn btn-success">Save Asset</button>
            </div>
        </StyledPanel>
    );
}
