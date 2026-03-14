import { useCallback } from 'react';
import confetti from 'canvas-confetti';

/**
 * A React hook that exposes `fire()` and `burst()` for celebratory confetti
 * animations using canvas-confetti.
 *
 * @return {{ fire: () => void, burst: () => void }}
 *
 * Logic:
 *   `fire()` — Launches a large dual-cannon confetti shower from the bottom-left
 *   and bottom-right corners simultaneously, intended for the moment a game
 *   finishes with a winner.
 *
 *   `burst()` — Fires a single moderate burst from the centre of the viewport,
 *   intended for repeated triggering (e.g. each click of the Winner badge).
 *
 *   Both functions are memoised with useCallback so they are stable across
 *   renders and safe to include in dependency arrays.  All exceptions are
 *   swallowed so animation failures are never fatal to the UI.
 */

/** Shared colour palette — festive, on-brand with the indigo/yellow UI. */
const COLORS = [
    '#6366f1', // indigo-500
    '#f59e0b', // amber-400
    '#10b981', // emerald-500
    '#f43f5e', // rose-500
    '#3b82f6', // blue-500
    '#a855f7', // purple-500
    '#facc15', // yellow-400
    '#ffffff', // white
];

/**
 * Fire a large dual-sided confetti shower from both bottom corners.
 * Used when the game ends with a winner.
 *
 * @return {void}
 */
const fireGameWin = () => {
    try {
        // Left cannon
        confetti({
            particleCount: 120,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 1 },
            colors: COLORS,
            gravity: 0.9,
            scalar: 1.1,
            ticks: 260,
            startVelocity: 55,
            zIndex: 9999,
        });

        // Right cannon
        confetti({
            particleCount: 120,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 1 },
            colors: COLORS,
            gravity: 0.9,
            scalar: 1.1,
            ticks: 260,
            startVelocity: 55,
            zIndex: 9999,
        });

        // Delayed centre burst for depth
        setTimeout(() => {
            confetti({
                particleCount: 60,
                angle: 90,
                spread: 80,
                origin: { x: 0.5, y: 0.7 },
                colors: COLORS,
                gravity: 1.1,
                scalar: 0.9,
                ticks: 200,
                startVelocity: 40,
                zIndex: 9999,
            });
        }, 250);
    } catch {
        // animation failures must never break the UI
    }
};

/**
 * Fire a single moderate confetti burst from the viewport centre.
 * Used when the Winner badge is clicked.
 *
 * @return {void}
 */
const fireBadgeBurst = () => {
    try {
        confetti({
            particleCount: 80,
            angle: 90,
            spread: 70,
            origin: { x: 0.5, y: 0.6 },
            colors: COLORS,
            gravity: 1.0,
            scalar: 1.0,
            ticks: 220,
            startVelocity: 45,
            zIndex: 9999,
        });
    } catch {
        // animation failures must never break the UI
    }
};

export default function useConfetti() {
    const fire = useCallback(fireGameWin, []);
    const burst = useCallback(fireBadgeBurst, []);

    return { fire, burst };
}
