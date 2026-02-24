import { DropCollision } from '../types';
import { stripExtension } from '../utils/diff';

interface DropCollisionDialogProps {
    dropCollision: DropCollision;
    onCancel: () => void;
    onOpenNewTab: () => void;
    onReplace: () => void;
    onMerge: () => void;
}

export function DropCollisionDialog({
    dropCollision,
    onCancel,
    onOpenNewTab,
    onReplace,
    onMerge,
}: DropCollisionDialogProps) {
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <div
                className="p-6 flex flex-col"
                style={{
                    backgroundColor: 'var(--bg-3)',
                    border: '2px solid var(--accent-main)',
                    width: '80%',
                    height: '80%',
                    maxWidth: '80vw',
                    maxHeight: '80vh',
                }}
            >
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-1)' }}>File Already Open</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
                    <span style={{ color: 'var(--accent-main)' }}>
                        {stripExtension(dropCollision.droppedFile.fileName)}
                    </span>{' '}
                    is already loaded.
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
                    <button onClick={onCancel} className="btn btn-secondary text-sm">Cancel</button>
                    <div className="flex-grow" />
                    <button onClick={onOpenNewTab} className="btn btn-secondary text-sm" style={{ border: '1px solid var(--accent-main)' }}>Open in New Tab</button>
                    <button onClick={onReplace} className="btn btn-secondary text-sm" style={{ border: '1px solid #f87171' }}>Replace Tab</button>
                    <button onClick={onMerge} className="btn btn-primary text-sm">Merge Values ({dropCollision.diffStats.changed})</button>
                </div>
            </div>
        </div>
    );
}
