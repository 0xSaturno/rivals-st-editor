import { ReactNode } from 'react';

interface StyledPanelProps {
    title: string;
    children: ReactNode;
    className?: string;
    maxHeight?: string;
    overflow?: string;
}

export function StyledPanel({
    title,
    children,
    className,
    maxHeight = 'calc(100vh - 360px)',
    overflow = 'auto',
}: StyledPanelProps) {
    return (
        <div
            className={`relative group ${className || ''}`}
            style={{ backgroundColor: 'var(--bg-3)' }}
        >
            <div
                className="absolute inset-0 border-2 pointer-events-none transition-colors"
                style={{ borderColor: 'var(--bg-2)' }}
            />
            <div
                className="absolute inset-0 border-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ borderColor: 'var(--accent-main)' }}
            />
            <h2
                className="absolute -top-3 left-4 px-2 text-xl font-medium"
                style={{ backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' }}
            >
                <span className="transition-colors group-hover:text-[--accent-main]">{title}</span>
            </h2>
            <div
                className={`p-6 pt-8 ${overflow === 'auto' ? 'overflow-y-auto' : ''}`}
                style={{
                    maxHeight,
                    overflow: overflow !== 'auto' ? overflow : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
}
