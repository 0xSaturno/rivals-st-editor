import { FileData } from '../types';

interface TabBarProps {
    filesData: FileData[];
    activeTabIndex: number;
    onTabSelect: (index: number) => void;
    onTabClose: (index: number) => void;
}

export function TabBar({ filesData, activeTabIndex, onTabSelect, onTabClose }: TabBarProps) {
    if (filesData.length <= 1) return null;

    return (
        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-2" style={{ borderBottom: '2px solid var(--bg-2)' }}>
            {filesData.map((fileData, index) => (
                <div
                    key={`tab-${fileData.fileName}-${index}`}
                    onClick={() => onTabSelect(index)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                        backgroundColor: activeTabIndex === index ? 'var(--bg-3)' : 'var(--bg-2)',
                        color: activeTabIndex === index ? 'var(--accent-main)' : 'var(--text-3)',
                        borderTop: activeTabIndex === index ? '2px solid var(--accent-main)' : '2px solid transparent',
                        borderLeft: '1px solid var(--bg-1)',
                        borderRight: '1px solid var(--bg-1)',
                        marginBottom: '-2px',
                    }}
                >
                    {fileData.fileName.replace(/\.(json|uasset)$/i, '')}
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            onTabClose(index);
                        }}
                        className="inline-flex items-center justify-center"
                        style={{ width: 16, height: 16, lineHeight: '16px', fontSize: 14, opacity: 0.5, borderRadius: 2 }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.backgroundColor = 'var(--bg-1)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.opacity = '0.5';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        ×
                    </span>
                </div>
            ))}
        </div>
    );
}
