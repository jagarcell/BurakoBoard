import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useCardPicker from '@/hooks/useCardPicker';

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

const sampleWeights = [
    { rank: 'joker', label: 'Joker',      points: 50, sort_order: 1 },
    { rank: '2',     label: 'Two (Wild)', points: 20, sort_order: 2 },
    { rank: 'A',     label: 'Ace',        points: 15, sort_order: 3 },
    { rank: 'K',     label: 'King',       points: 10, sort_order: 4 },
    { rank: 'Q',     label: 'Queen',      points: 10, sort_order: 5 },
    { rank: '3',     label: 'Three',      points: 5,  sort_order: 14 },
];

function mockFetchOk(weights = sampleWeights) {
    global.fetch = vi.fn().mockResolvedValue({
        ok:   true,
        json: () => Promise.resolve({ data: { card_weights: weights } }),
    });
}

function mockFetchError(status = 500) {
    global.fetch = vi.fn().mockResolvedValue({
        ok:     false,
        status,
        json:   () => Promise.resolve({}),
    });
}

function mockFetchNetworkFailure() {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    delete global.fetch;
});

// ---------------------------------------------------------------------------
// Initial loading state
// ---------------------------------------------------------------------------

describe('useCardPicker — initial state', () => {
    it('starts with loading=true and an empty card list', () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        expect(result.current.loading).toBe(true);
        expect(result.current.cardWeights).toEqual([]);
        expect(result.current.error).toBeNull();
        expect(result.current.totalPoints).toBe(0);
    });

    it('starts with an empty selected object', () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        expect(result.current.selected).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Fetch success
// ---------------------------------------------------------------------------

describe('useCardPicker — fetch success', () => {
    it('sets cardWeights and clears loading after a successful fetch', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.cardWeights).toEqual(sampleWeights);
        expect(result.current.error).toBeNull();
    });

    it('calls /api/v1/card-weights exactly once on mount', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(global.fetch).toHaveBeenCalledOnce();
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/card-weights');
    });
});

// ---------------------------------------------------------------------------
// Fetch failure
// ---------------------------------------------------------------------------

describe('useCardPicker — fetch failure', () => {
    it('sets error and clears loading when the server returns a non-ok status', async () => {
        mockFetchError(503);
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toMatch(/503/);
        expect(result.current.cardWeights).toEqual([]);
    });

    it('sets error and clears loading on a network failure', async () => {
        mockFetchNetworkFailure();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('Network failure');
    });
});

// ---------------------------------------------------------------------------
// addCard
// ---------------------------------------------------------------------------

describe('useCardPicker — addCard', () => {
    it('increments the count for a rank from 0 to 1', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('A'));
        expect(result.current.selected['A']).toBe(1);
    });

    it('increments an existing count from 1 to 2', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('K'));
        act(() => result.current.addCard('K'));
        expect(result.current.selected['K']).toBe(2);
    });

    it('can track multiple different ranks independently', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('A'));
        act(() => result.current.addCard('joker'));
        act(() => result.current.addCard('joker'));
        expect(result.current.selected['A']).toBe(1);
        expect(result.current.selected['joker']).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// removeCard
// ---------------------------------------------------------------------------

describe('useCardPicker — removeCard', () => {
    it('decrements a count from 2 to 1', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('Q'));
        act(() => result.current.addCard('Q'));
        act(() => result.current.removeCard('Q'));
        expect(result.current.selected['Q']).toBe(1);
    });

    it('removes the key entirely when count reaches 0', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('A'));
        act(() => result.current.removeCard('A'));
        expect(result.current.selected).not.toHaveProperty('A');
    });

    it('is a no-op when count is already 0 (key absent)', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Should not throw and key should remain absent.
        act(() => result.current.removeCard('2'));
        expect(result.current.selected).not.toHaveProperty('2');
    });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('useCardPicker — clear', () => {
    it('resets all selected counts to empty', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('A'));
        act(() => result.current.addCard('K'));
        act(() => result.current.addCard('K'));
        act(() => result.current.clear());
        expect(result.current.selected).toEqual({});
    });

    it('resets totalPoints to 0 after clear', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('joker'));
        expect(result.current.totalPoints).toBe(50);
        act(() => result.current.clear());
        expect(result.current.totalPoints).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// totalPoints
// ---------------------------------------------------------------------------

describe('useCardPicker — totalPoints', () => {
    it('returns 0 when nothing is selected', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.totalPoints).toBe(0);
    });

    it('computes the correct total for a single rank with count 1', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('A')); // 15 pts
        expect(result.current.totalPoints).toBe(15);
    });

    it('multiplies point value by count for repeated ranks', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('joker')); // 50
        act(() => result.current.addCard('joker')); // 50
        expect(result.current.totalPoints).toBe(100);
    });

    it('sums across multiple different ranks', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('joker')); // 50
        act(() => result.current.addCard('A'));      // 15
        act(() => result.current.addCard('K'));      // 10
        act(() => result.current.addCard('3'));      // 5
        expect(result.current.totalPoints).toBe(80);
    });

    it('decreases correctly after removeCard', async () => {
        mockFetchOk();
        const { result } = renderHook(() => useCardPicker());
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => result.current.addCard('2'));      // 20
        act(() => result.current.addCard('2'));      // 40
        act(() => result.current.removeCard('2'));   // 20
        expect(result.current.totalPoints).toBe(20);
    });
});
