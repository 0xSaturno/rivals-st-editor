import { Entry, FileData } from '../types';

interface StringTableResult {
    exportIndex: number;
    tableNamespace: string;
    valueArray: [string, string][];
}

export const findStringTableExport = (json: any): StringTableResult | null => {
    if (!json?.Exports) return null;

    for (let i = 0; i < json.Exports.length; i++) {
        const exp = json.Exports[i];

        if (exp?.["$type"]?.includes("StringTableExport") && exp?.Table?.Value) {
            return {
                exportIndex: i,
                tableNamespace: exp.Table.TableNamespace || '',
                valueArray: exp.Table.Value,
            };
        }
    }
    return null;
};

export const inferGamePath = (uassetPath: string | null, fileName: string): string => {
    if (!uassetPath) {
        const baseName = fileName.replace(/\.(uasset|json)$/i, '');
        return `Marvel/Content/StringTables/${baseName}`;
    }

    const pathStr = uassetPath.replace(/\\/g, '/');
    const idx = pathStr.indexOf('Marvel/Content');
    if (idx !== -1) {
        const gamePath = pathStr.substring(idx);
        return gamePath.replace(/\.uasset$/i, '');
    }

    const baseName = fileName.replace(/\.(uasset|json)$/i, '');
    return `Marvel/Content/StringTables/${baseName}`;
};

export const processFileContent = (
    fileName: string,
    content: string,
    uassetPath: string | null,
): FileData => {
    const json = JSON.parse(content);
    const result = findStringTableExport(json);

    if (!result) {
        throw new Error(
            `No StringTableExport found in ${fileName}. This file may not be a valid StringTable asset.`,
        );
    }

    const entries: Entry[] = result.valueArray.map((pair, idx) => ({
        id: crypto.randomUUID(),
        key: pair[0] || '',
        value: pair[1] || '',
        originalIndex: idx,
    }));

    return {
        fileName,
        originalJson: json,
        entries,
        exportIndex: result.exportIndex,
        tableNamespace: result.tableNamespace,
        uassetPath,
        gamePath: inferGamePath(uassetPath, fileName),
    };
};
