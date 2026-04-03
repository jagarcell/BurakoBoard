import { useState, useCallback, useEffect } from 'react';

/**
 * useCardPicker
 *
 * Manages card rank selection state for the tap-based card point picker.
 * Fetches the authoritative rank→points mapping once from the API on mount
 * and exposes addCard / removeCard / clear helpers plus a derived totalPoints.
 *
 * @returns {{
 *   cardWeights: Array<{rank: string, label: string, points: number, sort_order: number}>,
 *   selected: Object<string, number>,
 *   addCard: (rank: string) => void,
 *   removeCard: (rank: string) => void,
 *   clear: () => void,
 *   totalPoints: number,
 *   loading: boolean,
 *   error: string|null,
 * }}
 *
 * Logic:
 *  - On mount, fetches GET /api/v1/card-weights and stores the array in insertion
 *    order (the API already returns rows sorted by sort_order ascending).
 *  - selected is a plain object mapping rank → count; a missing key means 0.
 *  - addCard increments the count for the given rank.
 *  - removeCard decrements and removes the key when the count would reach 0
 *    to keep the object minimal and predictable for callers.
 *  - totalPoints is the dot-product of counts and point values over all selected ranks,
 *    recomputed on every render from the single source of truth (cardWeights + selected).
 *  - loading is true until the first successful fetch or a fetch error is received.
 *  - On fetch failure the error message is stored and loading is set to false so the
 *    UI can show a descriptive error rather than an infinite spinner.
 */
export default function useCardPicker() {
    const [cardWeights, setCardWeights] = useState([]);
    const [selected, setSelected]       = useState({});
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);

    useEffect(() => {
        fetch('/api/v1/card-weights')
            .then((res) => {
                if (!res.ok) throw new Error(`Failed to load cards (HTTP ${res.status})`);
                return res.json();
            })
            .then(({ data: { card_weights } }) => {
                setCardWeights(card_weights);
                setLoading(false);
            })
            .catch((err) => {
                setError(err?.message ?? 'Failed to load cards');
                setLoading(false);
            });
    }, []);

    /**
     * Increment the count for a given rank by one.
     *
     * @param {string} rank - Canonical rank string (e.g. 'A', '10', 'joker').
     * @returns {void}
     * Logic: Merges the incremented value into the previous selected object without
     * mutating it, ensuring React detects the state change and re-renders.
     */
    const addCard = useCallback((rank) => {
        setSelected((prev) => ({ ...prev, [rank]: (prev[rank] ?? 0) + 1 }));
    }, []);

    /**
     * Decrement the count for a given rank by one, removing it when it reaches zero.
     *
     * @param {string} rank - Canonical rank string to decrement.
     * @returns {void}
     * Logic: If the current count is 1 (or somehow 0), the key is deleted entirely
     * so the object stays minimal. Otherwise the count is decremented normally.
     * Callers should disable the remove action in the UI when count is already 0.
     */
    const removeCard = useCallback((rank) => {
        setSelected((prev) => {
            const curr = prev[rank] ?? 0;
            if (curr <= 1) {
                const next = { ...prev };
                delete next[rank];
                return next;
            }
            return { ...prev, [rank]: curr - 1 };
        });
    }, []);

    /**
     * Reset all selected counts to zero.
     *
     * @returns {void}
     * Logic: Replaces the selected object with an empty object, clearing all counts.
     */
    const clear = useCallback(() => setSelected({}), []);

    const totalPoints = cardWeights.reduce(
        (sum, cw) => sum + cw.points * (selected[cw.rank] ?? 0),
        0,
    );

    return { cardWeights, selected, addCard, removeCard, clear, totalPoints, loading, error };
}
