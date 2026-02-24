import { useMemo } from 'react';

export function Particles() {
    const particles = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 150; i++) {
            const size = Math.random() * 2.5 + 0.5;
            const duration = 5 + Math.random() * 10;
            arr.push(
                <div
                    key={i}
                    className="particle"
                    style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `-${Math.random() * duration}s`,
                        animationDuration: `${duration}s`,
                    }}
                />,
            );
        }
        return arr;
    }, []);

    return <div className="particles">{particles}</div>;
}
