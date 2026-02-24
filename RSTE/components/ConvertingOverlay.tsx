interface ConvertingOverlayProps {
    isConverting: boolean;
}

export function ConvertingOverlay({ isConverting }: ConvertingOverlayProps) {
    if (!isConverting) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
            <div
                className="p-8 text-center"
                style={{ backgroundColor: 'var(--bg-3)', border: '2px solid var(--accent-main)' }}
            >
                <div className="text-xl" style={{ color: 'var(--text-1)' }}>Converting...</div>
            </div>
        </div>
    );
}
