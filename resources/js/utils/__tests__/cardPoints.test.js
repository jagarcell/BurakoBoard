import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sumCardPoints, getCardWeightsMap, sumCardPointsAsync } from '@/utils/cardPoints';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Map<rank, points> matching the canonical Burako card weights. */
function makeWeightsMap() {
    return new Map([
        ['joker', 50],
        ['2',     20],
        ['A',     15],
        ['K',     10],
        ['Q',     10],
        ['J',     10],
        ['10',    10],
        ['9',     10],
        ['8',     10],
        ['7',      5],
        ['6',      5],
        ['5',      5],
        ['4',      5],
        ['3',      5],
    ]);
}

describe('sumCardPoints', () => {
    const map = makeWeightsMap();

    it('returns 0 for an empty ranks array', () => {
        expect(sumCardPoints([], map)).toBe(0);
    });

    it('maps a Joker to 50 pts', () => {
        expect(sumCardPoints(['joker'], map)).toBe(50);
    });

    it('maps a wild 2 to 20 pts', () => {
        expect(sumCardPoints(['2'], map)).toBe(20);
    });

    it('maps an Ace to 15 pts', () => {
        expect(sumCardPoints(['A'], map)).toBe(15);
    });

    it('maps high cards (K, Q, J, 10, 9, 8) to 10 pts each', () => {
        for (const rank of ['K', 'Q', 'J', '10', '9', '8']) {
            expect(sumCardPoints([rank], map)).toBe(10);
        }
    });

    it('maps low cards (7, 6, 5, 4, 3) to 5 pts each', () => {
        for (const rank of ['7', '6', '5', '4', '3']) {
            expect(sumCardPoints([rank], map)).toBe(5);
        }
    });

    it('sums multiple ranks correctly', () => {
        // A(15) + K(10) + 7(5) + joker(50) = 80
        expect(sumCardPoints(['A', 'K', '7', 'joker'], map)).toBe(80);
    });

    it('returns 0 for an unrecognised rank (graceful degradation)', () => {
        expect(sumCardPoints(['X'], map)).toBe(0);
    });

    it('sums a mix of known and unknown ranks, ignoring unknowns', () => {
        // A(15) + unknown(0) + 3(5) = 20
        expect(sumCardPoints(['A', 'UNKNOWN', '3'], map)).toBe(20);
    });

    it('handles duplicate ranks by summing each occurrence', () => {
        // A(15) + A(15) = 30
        expect(sumCardPoints(['A', 'A'], map)).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// getCardWeightsMap — tests that the module-level fetch+cache works correctly
// ---------------------------------------------------------------------------

describe('getCardWeightsMap', () => {
    beforeEach(() => {
        // Reset the module-level cache between tests so each test starts fresh.
        vi.resetModules();
        global.fetch = vi.fn();
    });

    it('fetches from /api/v1/card-weights and returns a Map', async () => {
        const { getCardWeightsMap: freshGet } = await import('@/utils/cardPoints');

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    card_weights: [
                        { rank: 'A',     points: 15 },
                        { rank: 'joker', points: 50 },
                    ],
                },
            }),
        });

        const map = await freshGet();
        expect(map).toBeInstanceOf(Map);
        expect(map.get('A')).toBe(15);
        expect(map.get('joker')).toBe(50);
    });

    it('throws and resets the cache when the fetch fails', async () => {
        const { getCardWeightsMap: freshGet } = await import('@/utils/cardPoints');

        global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

        await expect(freshGet()).rejects.toThrow('Failed to fetch card weights: 500');

        // After failure a second call should retry (fetch called again).
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { card_weights: [{ rank: 'K', points: 10 }] } }),
        });
        const map = await freshGet();
        expect(map.get('K')).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// sumCardPointsAsync — convenience wrapper
// ---------------------------------------------------------------------------

describe('sumCardPointsAsync', () => {
    beforeEach(() => {
        vi.resetModules();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    card_weights: Array.from(makeWeightsMap(), ([rank, points]) => ({ rank, points })),
                },
            }),
        });
    });

    it('fetches the map and returns summed points for given ranks', async () => {
        const { sumCardPointsAsync: freshSum } = await import('@/utils/cardPoints');
        // 2(20) + A(15) + 3(5) = 40
        const total = await freshSum(['2', 'A', '3']);
        expect(total).toBe(40);
    });

    it('returns 0 for an empty ranks array', async () => {
        const { sumCardPointsAsync: freshSum } = await import('@/utils/cardPoints');
        expect(await freshSum([])).toBe(0);
    });
});
