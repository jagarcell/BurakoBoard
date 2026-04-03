import { useMemo, useEffect } from 'react';
import useCardPicker from '@/hooks/useCardPicker';

/**
 * RankTile
 *
 * Individual card rank picker tile with an inline +/− stepper.
 *
 * @param {Object}   props
 * @param {string}   props.rank     - Canonical rank string (e.g. 'A', '10', 'joker').
 * @param {string}   props.label    - Human-readable rank name (e.g. 'Ace').
 * @param {number}   props.count    - Number of this rank currently selected (≥ 0).
 * @param {Function} props.onAdd    - Called when the + button is tapped.
 * @param {Function} props.onRemove - Called when the − button is tapped.
 *
 * Logic: Renders a rounded tile with the rank glyph, label and a +/− stepper.
 * The tile is highlighted with an emerald border/background when count > 0.
 * The − button is disabled when count is 0 to prevent negative selections.
 * 'joker' is rendered as the ★ glyph for visual distinction.
 */
function RankTile({ rank, label, count, onAdd, onRemove }) {
    return (
        <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2 transition ${
                count > 0
                    ? 'border-emerald-500 bg-emerald-950/60'
                    : 'border-slate-700 bg-slate-800/60'
            }`}
        >
            <div className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-none text-white">
                    {rank === 'joker' ? '★' : rank}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">{label}</span>
            </div>

            <div className="ml-2 flex items-center gap-2">
                <button
                    aria-label={`Remove one ${label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white transition active:scale-95 disabled:opacity-30"
                    disabled={count === 0}
                    onClick={onRemove}
                    type="button"
                >
                    −
                </button>
                <span
                    aria-label={`${label} count`}
                    className="w-6 text-center text-sm font-semibold text-white"
                >
                    {count}
                </span>
                <button
                    aria-label={`Add one ${label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white transition active:scale-95"
                    onClick={onAdd}
                    type="button"
                >
                    +
                </button>
            </div>
        </div>
    );
}

/**
 * CardPointsScanner
 *
 * Full-screen modal that lets a user tap to select card ranks and accumulate
 * a total point value before applying it to a score input field.
 *
 * Replaces the previous camera/OCR approach with a reliable tap-picker that
 * fetches the authoritative rank→points map from /api/v1/card-weights.
 *
 * @param {Object}   props
 * @param {string}   props.label    - Human-readable field label (e.g. "Points in Hand").
 * @param {Function} props.onApply  - Called with the total point number when Apply is tapped.
 * @param {Function} props.onCancel - Called with no arguments when Cancel is tapped or Escape pressed.
 *
 * Logic:
 *  - useCardPicker fetches available card ranks from the API on mount.
 *  - Ranks are grouped by point tier (descending) and rendered as RankTile rows.
 *  - Tapping + increments the count for that rank; tapping − decrements it.
 *  - A Clear link resets all counts when at least one card is selected.
 *  - The footer shows the running total and Apply/Cancel actions.
 *  - Apply is enabled once totalPoints > 0.
 *  - Escape key triggers onCancel for keyboard/accessibility users.
 */
export default function CardPointsScanner({ label, onApply, onCancel }) {
    const {
        cardWeights,
        selected,
        addCard,
        removeCard,
        clear,
        totalPoints,
        loading,
        error,
    } = useCardPicker();

    // Close on Escape for accessibility.
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onCancel]);

    // Group ranks by point tier, sorted descending by point value.
    const groups = useMemo(() => {
        const map = new Map();
        for (const cw of cardWeights) {
            if (!map.has(cw.points)) map.set(cw.points, []);
            map.get(cw.points).push(cw);
        }
        return [...map.entries()].sort((a, b) => b[0] - a[0]);
    }, [cardWeights]);

    return (
        <div
            aria-modal="true"
            className="fixed inset-0 z-50 flex flex-col bg-slate-900"
            role="dialog"
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Pick Cards — {label}</h2>
                <button
                    aria-label="Cancel picker"
                    className="rounded p-1 text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    onClick={onCancel}
                    type="button"
                >
                    ✕
                </button>
            </div>

            {/* Scrollable rank picker */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <span className="text-sm text-white/60">Loading cards…</span>
                    </div>
                )}

                {error && (
                    <div className="flex items-center justify-center py-12">
                        <p className="rounded bg-red-900/60 px-4 py-2 text-center text-sm text-red-400">
                            {error}
                        </p>
                    </div>
                )}

                {!loading && !error && groups.map(([pts, ranks]) => (
                    <div key={pts}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {pts} {pts === 1 ? 'pt' : 'pts'} each
                        </p>
                        <div className="space-y-2">
                            {ranks.map((cw) => (
                                <RankTile
                                    key={cw.rank}
                                    rank={cw.rank}
                                    label={cw.label}
                                    count={selected[cw.rank] ?? 0}
                                    onAdd={() => addCard(cw.rank)}
                                    onRemove={() => removeCard(cw.rank)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer — total + actions */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-white">
                        Total:&nbsp;
                        <span className="text-emerald-400" data-testid="picker-total">
                            {totalPoints} pts
                        </span>
                    </div>
                    {totalPoints > 0 && (
                        <button
                            aria-label="Clear selection"
                            className="text-xs text-slate-500 underline hover:text-slate-300 focus:outline-none"
                            onClick={clear}
                            type="button"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        onClick={onCancel}
                        type="button"
                    >
                        Cancel
                    </button>
                    <button
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
                        data-testid="picker-apply"
                        disabled={totalPoints === 0}
                        onClick={() => onApply(totalPoints)}
                        type="button"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
