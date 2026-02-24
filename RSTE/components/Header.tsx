import type { RefObject } from 'react';
import { Particles } from './Particles';

interface HeaderProps {
    onShowSettings: () => void;
    resetButtonRef: RefObject<HTMLButtonElement>;
    onResetPress: () => void;
    onResetRelease: () => void;
}

export function Header({ onShowSettings, resetButtonRef, onResetPress, onResetRelease }: HeaderProps) {
    return (
        <header
            className="relative group p-4 border-2 particle-header mb-8"
            style={{ borderColor: 'var(--bg-2)', userSelect: 'none' }}
        >
            <Particles />
            <div
                className="absolute inset-0 border-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ borderColor: 'var(--accent-main)', zIndex: 2 }}
            />
            <div className="flex justify-between items-center w-full relative" style={{ zIndex: 1 }}>
                <div className="flex items-center gap-4">
                    <img src="./assets/saturn-logo.svg" alt="Logo" className="h-24 filter brightness-0 invert" />
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-5xl font-normal" style={{ color: 'var(--text-1)' }}>Rivals ST Editor</h1>
                        <h2 className="text-1xl font-medium" style={{ color: 'var(--text-4)' }}>v1.0.0</h2>
                    </div>
                </div>
                <div className="flex flex-col items-end" style={{ gap: '3rem' }}>
                    <div className="flex gap-2">
                        <button
                            onClick={onShowSettings}
                            className="hover:text-[var(--accent-main)] transition-colors p-1"
                            style={{ color: 'var(--text-3)' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                        <button
                            ref={resetButtonRef}
                            title="Hold 2s to Reset"
                            className="hover:text-[var(--accent-main)] transition-colors p-1"
                            style={{ color: 'var(--text-3)' }}
                            onMouseDown={onResetPress}
                            onMouseUp={onResetRelease}
                            onMouseLeave={onResetRelease}
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
    );
}
