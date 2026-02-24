import { useRef, useCallback } from 'react';

export function useResetButton(onClear: () => void) {
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resetButtonRef = useRef<HTMLButtonElement>(null!)
    const animationFrameRef = useRef<number | null>(null);
    const pressStartTimeRef = useRef<number | null>(null);

    const shakeEffect = useCallback(() => {
        if (!resetButtonRef.current || !pressStartTimeRef.current) return;
        const elapsedTime = Date.now() - pressStartTimeRef.current;
        const progress = Math.min(elapsedTime / 2000, 1);
        const maxIntensity = 4;
        const currentIntensity = maxIntensity * progress;
        const x = (Math.random() - 0.5) * 2 * currentIntensity;
        const y = (Math.random() - 0.5) * 2 * currentIntensity;
        resetButtonRef.current.style.transform = `translate(${x}px, ${y}px)`;
        animationFrameRef.current = requestAnimationFrame(shakeEffect);
    }, []);

    const handleResetPress = useCallback(() => {
        pressStartTimeRef.current = Date.now();
        animationFrameRef.current = requestAnimationFrame(shakeEffect);
        resetTimerRef.current = setTimeout(() => {
            onClear();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (resetButtonRef.current) {
                resetButtonRef.current.style.transform = 'translate(0, 0)';
            }
        }, 2000);
    }, [onClear, shakeEffect]);

    const handleResetRelease = useCallback(() => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (resetButtonRef.current) {
            resetButtonRef.current.style.transform = 'translate(0, 0)';
        }
    }, []);

    return { resetButtonRef, handleResetPress, handleResetRelease };
}
