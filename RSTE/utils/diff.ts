import { Entry, DiffStats } from '../types';

export const stripExtension = (name: string): string =>
    name.replace(/\.(uasset|json)$/i, '');

export const computeDiffStats = (existingEntries: Entry[], droppedEntries: Entry[]): DiffStats => {
    const droppedMap = new Map(droppedEntries.map(e => [e.key, e.value]));
    const existingMap = new Map(existingEntries.map(e => [e.key, e.value]));
    let changed = 0, unchanged = 0, newKeys = 0, missingKeys = 0;
    const changedEntries: DiffStats['changedEntries'] = [];

    for (const [key, value] of droppedMap) {
        if (existingMap.has(key)) {
            if (existingMap.get(key) !== value) {
                changed++;
                changedEntries.push({ key, oldValue: existingMap.get(key)!, newValue: value });
            } else {
                unchanged++;
            }
        } else {
            newKeys++;
        }
    }
    for (const key of existingMap.keys()) {
        if (!droppedMap.has(key)) missingKeys++;
    }
    return { changed, unchanged, newKeys, missingKeys, changedEntries };
};
