import { useCallback, useRef } from 'react';

/**
 * A React hook that exposes `unlock()` and `play()` for a short victory
 * fanfare using the Web Audio API.
 *
 * @return {{ unlock: () => void, play: () => void }}
 *
 * Logic:
 *   iOS Safari requires AudioContext to be created **and** resumed
 *   synchronously inside a user-gesture event handler.  Because `play()` is
 *   called after an async API round-trip, the gesture activation has already
 *   been consumed by then.  The solution is a two-step API:
 *
 *   1. `unlock()` — call this synchronously at the start of the user-gesture
 *      handler (before any `await`).  It creates the shared AudioContext once
 *      and calls `ctx.resume()` while the gesture is still live.  It also
 *      plays a zero-duration silent <audio> element to claim the iOS
 *      "playback" audio session category, which bypasses the hardware
 *      mute/silent switch (unlike the default "ambient" category used by the
 *      Web Audio API alone).
 *
 *   2. `play()` — call this at any time after the async work completes.  It
 *      reuses the already-resumed context and cycles through four distinct
 *      fanfares (A → B → C → D → A → …) via a per-instance rotation index.
 *      If the context is somehow still suspended it calls `ctx.resume()` itself
 *      and chains the note scheduling in the resolved promise, so it works on
 *      non-iOS browsers even without a prior `unlock()` call.
 *
 *   Both functions swallow all exceptions so audio failures are never fatal.
 */
// Minimal silent WAV (44 bytes) encoded as a data URI. Playing it via an
// HTMLAudioElement inside a user gesture claims the iOS "playback" audio
// session, which is not muted by the hardware silent switch.
const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/**
 * Four distinct victory fanfares (A, B, C, D) represented as arrays of notes.
 * Each note is { freq: Hz, start: seconds-from-now, duration: seconds }.
 *
 * A — Royal fanfare  : C4 → G4 → C5 → E5 → G5 (stately ascending)
 * B — March fanfare  : E4 → G4 → A4 → C5 → E5 (brisk staccato climb)
 * C — Bugle fanfare  : G4 → C5 → G4 → C5 → G5 (alternating call)
 * D — Cascade fanfare: C5 → E5 → G5 → C6 → E6 (rapid high-register sweep)
 */
const FANFARES = [
    // A — Royal
    [
        { freq: 261.63, start: 0.00, duration: 0.35 }, // C4
        { freq: 392.00, start: 0.30, duration: 0.35 }, // G4
        { freq: 523.25, start: 0.60, duration: 0.35 }, // C5
        { freq: 659.25, start: 0.90, duration: 0.35 }, // E5
        { freq: 783.99, start: 1.20, duration: 1.10 }, // G5 (hold)
    ],
    // B — March
    [
        { freq: 329.63, start: 0.00, duration: 0.20 }, // E4
        { freq: 392.00, start: 0.20, duration: 0.20 }, // G4
        { freq: 440.00, start: 0.40, duration: 0.20 }, // A4
        { freq: 523.25, start: 0.60, duration: 0.20 }, // C5
        { freq: 659.25, start: 0.80, duration: 0.90 }, // E5 (hold)
    ],
    // C — Bugle
    [
        { freq: 392.00, start: 0.00, duration: 0.15 }, // G4
        { freq: 523.25, start: 0.15, duration: 0.15 }, // C5
        { freq: 392.00, start: 0.30, duration: 0.15 }, // G4
        { freq: 523.25, start: 0.45, duration: 0.15 }, // C5
        { freq: 783.99, start: 0.60, duration: 1.00 }, // G5 (hold)
    ],
    // D — Cascade
    [
        { freq:  523.25, start: 0.00, duration: 0.20 }, // C5
        { freq:  659.25, start: 0.20, duration: 0.20 }, // E5
        { freq:  783.99, start: 0.40, duration: 0.20 }, // G5
        { freq: 1046.50, start: 0.60, duration: 0.20 }, // C6
        { freq: 1318.51, start: 0.80, duration: 0.90 }, // E6 (hold)
    ],
];

export default function useWinnerSound() {
    const ctxRef = useRef(null);
    /** Stores the Promise returned by ctx.resume() so play() can chain on it. */
    const resumePromiseRef = useRef(null);
    /** Reusable silent HTMLAudioElement used to claim the iOS playback session. */
    const silentAudioRef = useRef(null);
    /** Zero-based index of the next fanfare to play; wraps after FANFARES.length. */
    const fanfareIndexRef = useRef(0);

    /**
     * Returns the shared AudioContext, creating it on first call.
     *
     * @return {AudioContext|null} The shared context, or null when the API is
     *   unavailable.
     *
     * Logic: Checks for an existing ctx in the ref before constructing a new
     * one so the same context is reused across unlock() and play() calls.
     */
    const getOrCreateCtx = useCallback(() => {
        if (ctxRef.current) return ctxRef.current;
        /* global window */
        const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioCtor) return null;
        ctxRef.current = new AudioCtor();
        return ctxRef.current;
    }, []);

    /**
     * Schedules the notes of the given fanfare on the provided AudioContext.
     *
     * @param {AudioContext}              ctx   A running (non-suspended) AudioContext.
     * @param {{ freq: number, start: number, duration: number }[]} notes
     *   Array of note descriptors from one of the FANFARES entries.
     * @return {void}
     *
     * Logic: Creates one OscillatorNode + GainNode pair per note, connects
     * them, applies a linear gain envelope to avoid clicks, and schedules each
     * note at its offset from ctx.currentTime.  All notes use a sine-wave
     * oscillator at gain 0.7.
     */
    const scheduleNotes = useCallback((ctx, notes) => {
        notes.forEach(({ freq, start, duration }) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

            const t0 = ctx.currentTime + start;
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(0.7, t0 + 0.01);
            gain.gain.linearRampToValueAtTime(0,   t0 + duration);

            osc.start(t0);
            osc.stop(t0 + duration + 0.05);
        });
    }, []);

    /**
     * Unlocks the AudioContext for iOS Safari.
     *
     * @return {void}
     *
     * Logic: Must be called synchronously inside a user-gesture event handler
     * (before any awaits).  Creates the shared AudioContext if it does not
     * exist yet and always calls ctx.resume() — even when the context appears
     * "running" — because iOS Safari requires resume() to be called within the
     * user gesture.  The returned Promise is stored in resumePromiseRef so
     * play() can chain on it instead of calling resume() a second time outside
     * the gesture (which iOS would silently refuse).  resume() is idempotent
     * when the context is already running.
     *
     *   Additionally, a silent HTMLAudioElement is played to claim the iOS
     *   "playback" audio session category.  This category is not affected by
     *   the hardware mute/silent switch, ensuring the Web Audio API output is
     *   audible even when the switch is engaged.
     */
    const unlock = useCallback(() => {
        try {
            // Play a silent <audio> element to claim the iOS "playback" session.
            if (!silentAudioRef.current) {
                /* global Audio */
                silentAudioRef.current = new Audio(SILENT_WAV);
                silentAudioRef.current.volume = 0;
            }
            silentAudioRef.current.play().catch(() => {});

            const ctx = getOrCreateCtx();
            if (!ctx) return;
            resumePromiseRef.current = ctx.resume();
        } catch {
            // Silently ignore — audio is non-critical.
        }
    }, [getOrCreateCtx]);

    /**
     * Plays the next fanfare in the A → B → C → D → A rotation.
     *
     * @return {void}
     *
     * Logic: Reads `fanfareIndexRef` to pick the current FANFARES entry, then
     * advances the index (wrapping at 4) before scheduling notes so subsequent
     * calls always use the next tone.  Reuses the shared AudioContext (created
     * by unlock() or lazily here).  If unlock() was previously called its
     * stored Promise is chained so notes are scheduled only after the context
     * is fully running — without needing a second ctx.resume() call outside
     * the user gesture (which iOS Safari would refuse).  If unlock() was NOT
     * called and the context is still suspended it falls back to calling
     * ctx.resume() itself.  All errors are swallowed.
     */
    const play = useCallback(() => {
        try {
            const ctx = getOrCreateCtx();
            if (!ctx) return;

            const notes = FANFARES[fanfareIndexRef.current];
            fanfareIndexRef.current = (fanfareIndexRef.current + 1) % FANFARES.length;

            const doPlay = () => scheduleNotes(ctx, notes);

            if (resumePromiseRef.current) {
                // Chain on the Promise already obtained in unlock() so we never
                // call ctx.resume() outside a user gesture on iOS.
                resumePromiseRef.current
                    .then(doPlay)
                    .catch(() => {});
            } else if (ctx.state === 'suspended') {
                ctx.resume()
                    .then(() => scheduleNotes(ctx, notes))
                    .catch(() => {});
            } else {
                scheduleNotes(ctx, notes);
            }
        } catch {
            // AudioContext unavailable or blocked — silently ignore.
        }
    }, [getOrCreateCtx, scheduleNotes]);

    return { unlock, play };
}
