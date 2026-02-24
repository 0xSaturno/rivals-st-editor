import { invoke } from '@tauri-apps/api/core';
import { Settings } from '../types';

interface SettingsModalProps {
    settings: Settings;
    isLoadingLocres: boolean;
    hasLoadedFiles: boolean;
    onClose: () => void;
    onSelectUsmapFile: () => void;
    onSelectRivalsPakPath: () => void;
    onSettingsChange: (settings: Settings) => void;
    onLoadLocresData: () => Promise<void>;
    onClearLocresData: () => void;
}

export function SettingsModal({
    settings,
    isLoadingLocres,
    hasLoadedFiles,
    onClose,
    onSelectUsmapFile,
    onSelectRivalsPakPath,
    onSettingsChange,
    onLoadLocresData,
    onClearLocresData,
}: SettingsModalProps) {
    const handleLocresLanguageChange = async (newLanguage: string) => {
        onSettingsChange({ ...settings, locresLanguage: newLanguage });
        try {
            await invoke('set_locres_language', { language: newLanguage });
            if (hasLoadedFiles) {
                console.log(`[LocresReader] Language changed to ${newLanguage}, reloading locres data...`);
                await onLoadLocresData();
            } else {
                onClearLocresData();
            }
        } catch (err) {
            console.error('Failed to save language setting:', err);
        }
    };

    const handleBackupChange = async (enabled: boolean) => {
        onSettingsChange({ ...settings, enableBackup: enabled });
        try {
            await invoke('set_enable_backup', { enable: enabled });
        } catch (err) {
            console.error('Failed to save backup setting:', err);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <div className="p-6 max-w-lg w-full" style={{ backgroundColor: 'var(--bg-3)', border: '2px solid var(--bg-2)' }}>
                <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>Settings</h2>

                <div className="mb-4">
                    <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>Rivals Paks Path</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={settings.rivalsPakPath || 'Not set'}
                            className="flex-1 px-3 py-2 text-sm"
                            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--bg-1)' }}
                        />
                        <button onClick={onSelectRivalsPakPath} className="btn btn-primary text-sm">Browse</button>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>USMAP File Path</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={settings.usmapPath || 'Not set'}
                            className="flex-1 px-3 py-2 text-sm"
                            style={{ backgroundColor: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--bg-1)' }}
                        />
                        <button onClick={onSelectUsmapFile} className="btn btn-primary text-sm">Browse</button>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>
                        Locres Language {isLoadingLocres && <span style={{ color: 'var(--accent-main)' }}>(Loading...)</span>}
                    </label>
                    <select
                        value={settings.locresLanguage || 'en'}
                        disabled={isLoadingLocres}
                        onChange={(e) => handleLocresLanguageChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm"
                        style={{
                            backgroundColor: 'var(--bg-2)',
                            color: 'var(--text-2)',
                            border: '1px solid var(--bg-1)',
                            opacity: isLoadingLocres ? 0.6 : 1,
                        }}
                    >
                        <option value="ar">Arabic (ar)</option>
                        <option value="de">German (de)</option>
                        <option value="en">English (en)</option>
                        <option value="es-419">Spanish - Latin America (es-419)</option>
                        <option value="es-ES">Spanish - Spain (es-ES)</option>
                        <option value="fr">French (fr)</option>
                        <option value="it">Italian (it)</option>
                        <option value="ja">Japanese (ja)</option>
                        <option value="ko">Korean (ko)</option>
                        <option value="pl">Polish (pl)</option>
                        <option value="pt-BR">Portuguese - Brazil (pt-BR)</option>
                        <option value="ru">Russian (ru)</option>
                        <option value="th">Thai (th)</option>
                        <option value="tr">Turkish (tr)</option>
                        <option value="zh-Hans">Chinese - Simplified (zh-Hans)</option>
                        <option value="zh-Hans-CN">Chinese - Simplified CN (zh-Hans-CN)</option>
                        <option value="zh-Hant">Chinese - Traditional (zh-Hant)</option>
                    </select>
                </div>

                <div className="mb-6">
                    <label className="block text-sm mb-2" style={{ color: 'var(--text-3)' }}>Advanced</label>
                    <div className="mb-3 flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="enableBackup"
                            checked={settings.enableBackup !== false}
                            onChange={(e) => handleBackupChange(e.target.checked)}
                            className="cursor-pointer"
                            style={{ width: '16px', height: '16px' }}
                        />
                        <label htmlFor="enableBackup" className="text-sm cursor-pointer" style={{ color: 'var(--text-2)' }}>
                            Create uasset backups on import
                        </label>
                    </div>
                    <button
                        onClick={() => invoke('open_temp_folder')}
                        className="btn btn-secondary text-sm w-full"
                        style={{ border: '1px solid var(--bg-1)' }}
                    >
                        Open Temp Folder
                    </button>
                </div>

                <div className="flex justify-end">
                    <button onClick={onClose} className="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    );
}
