import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface DragDropCallbacks {
    onDrop: (paths: string[]) => void;
    onDragChange: (dragging: boolean) => void;
}

export function useDragDrop(callbacks: DragDropCallbacks) {
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    useEffect(() => {
        let unlistenDrop: (() => void) | undefined;
        let unlistenEnter: (() => void) | undefined;
        let unlistenLeave: (() => void) | undefined;

        const setup = async () => {
            unlistenEnter = await listen('tauri://drag-enter', () =>
                callbacksRef.current.onDragChange(true),
            );
            unlistenLeave = await listen('tauri://drag-leave', () =>
                callbacksRef.current.onDragChange(false),
            );
            unlistenDrop = await listen('tauri://drag-drop', (event: any) => {
                callbacksRef.current.onDragChange(false);
                const paths = event.payload.paths || event.payload;
                if (paths?.length) callbacksRef.current.onDrop(paths);
            });
        };
        setup();

        return () => {
            unlistenDrop?.();
            unlistenEnter?.();
            unlistenLeave?.();
        };
    }, []);
}
