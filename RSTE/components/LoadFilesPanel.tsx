import { DragEvent, ChangeEvent } from 'react';
import { StyledPanel } from './StyledPanel';

interface LoadFilesPanelProps {
    isDragging: boolean;
    isExtracting: boolean;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onExtractStringTables: () => void;
}

export function LoadFilesPanel({
    isDragging,
    isExtracting,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileChange,
    onExtractStringTables,
}: LoadFilesPanelProps) {
    return (
        <StyledPanel title="Load Files">
            <div
                className="text-center py-20 px-6 border-2 border-dashed transition-colors"
                style={{
                    backgroundColor: 'var(--bg-2)',
                    borderColor: isDragging ? 'var(--accent-main)' : 'var(--bg-1)',
                }}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                    <svg className="mx-auto h-12 w-12" style={{ color: 'var(--text-4)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div className="flex items-center gap-2 mt-2">
                        <h3 className="text-lg font-medium" style={{ color: 'var(--text-2)' }}>No files loaded</h3>
                        <img src="./assets/images/shrug.png" alt="shrug" className="h-6 w-6" />
                    </div>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-4)' }}>
                        Drag & drop .json or .uasset StringTable files here
                    </p>
                    <input type="file" className="hidden" multiple accept=".json,.uasset" onChange={onFileChange} />
                </label>
            </div>
            <div className="flex justify-center mt-4">
                <button
                    onClick={onExtractStringTables}
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
    );
}
