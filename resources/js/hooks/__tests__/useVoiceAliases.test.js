import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import useVoiceAliases from '@/hooks/useVoiceAliases';

vi.mock('axios');

const mockAliases = [
    { id: 1, alias: 'canada', keyword: 'canastra' },
    { id: 2, alias: 'morocco', keyword: 'burako' },
];

describe('useVoiceAliases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches aliases on mount and populates state', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: mockAliases } });

        const { result } = renderHook(() => useVoiceAliases());

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.aliases).toEqual(mockAliases);
        expect(result.current.error).toBeNull();
        expect(axios.get).toHaveBeenCalledWith('/api/v1/user/voice-aliases');
    });

    it('sets error state when the fetch fails', async () => {
        axios.get.mockRejectedValueOnce(new Error('Network error'));

        const { result } = renderHook(() => useVoiceAliases());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error).toBe('Failed to load voice aliases.');
        expect(result.current.aliases).toEqual([]);
    });

    it('falls back to an empty array when the API response data.data is not an array', async () => {
        // Simulate an unexpected server response (e.g., a wrapped error body)
        // where data.data is an object instead of an array.
        axios.get.mockResolvedValueOnce({ data: { data: { message: 'unexpected' } } });

        const { result } = renderHook(() => useVoiceAliases());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.aliases).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it('addAlias posts to the API and merges the result into aliases sorted alphabetically', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: [] } });
        const created = { id: 3, alias: 'africa', keyword: 'burako' };
        axios.post.mockResolvedValueOnce({ data: { data: created } });

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.addAlias('africa', 'burako');
        });

        expect(axios.post).toHaveBeenCalledWith('/api/v1/user/voice-aliases', {
            alias: 'africa',
            keyword: 'burako',
        });
        expect(result.current.aliases).toContainEqual(created);
    });

    it('addAlias inserts the new alias in sorted order', async () => {
        const initial = [
            { id: 1, alias: 'apple', keyword: 'a' },
            { id: 2, alias: 'zebra', keyword: 'z' },
        ];
        axios.get.mockResolvedValueOnce({ data: { data: initial } });
        const created = { id: 3, alias: 'mango', keyword: 'm' };
        axios.post.mockResolvedValueOnce({ data: { data: created } });

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.addAlias('mango', 'm');
        });

        expect(result.current.aliases.map((a) => a.alias)).toEqual(['apple', 'mango', 'zebra']);
    });

    it('addAlias throws when the API returns a validation error', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: [] } });
        const apiError = Object.assign(new Error('Duplicate'), {
            response: { data: { errors: { alias: ['You already have an alias for that word.'] } } },
        });
        axios.post.mockRejectedValueOnce(apiError);

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await expect(
            act(async () => { await result.current.addAlias('duplicate', 'test'); })
        ).rejects.toThrow();
    });

    it('removeAlias removes the alias optimistically before the API responds', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: mockAliases } });
        axios.delete.mockResolvedValueOnce({});

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.removeAlias(1);
        });

        // Optimistic update: alias with id 1 should be gone immediately
        expect(result.current.aliases.find((a) => a.id === 1)).toBeUndefined();
    });

    it('removeAlias calls DELETE on the correct endpoint', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: mockAliases } });
        axios.delete.mockResolvedValueOnce({});

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.removeAlias(2);
        });

        expect(axios.delete).toHaveBeenCalledWith('/api/v1/user/voice-aliases/2');
    });

    it('removeAlias rolls back on API failure by re-fetching', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { data: mockAliases } })  // initial fetch
            .mockResolvedValueOnce({ data: { data: mockAliases } });  // rollback re-fetch

        axios.delete.mockRejectedValueOnce(new Error('Server error'));

        const { result } = renderHook(() => useVoiceAliases());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.removeAlias(1);
        });

        // After rollback re-fetch the alias should be restored
        await waitFor(() => {
            expect(result.current.aliases.find((a) => a.id === 1)).toBeDefined();
        });
    });
});
