import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * React hook for managing the authenticated user's voice recognition aliases.
 *
 * Fetches aliases from the API on mount and exposes CRUD operations with
 * optimistic updates so the UI stays responsive without waiting for network
 * round-trips.
 *
 * @return {{
 *   aliases: Array<{ id: number, alias: string, keyword: string }>,
 *   isLoading: boolean,
 *   error: string | null,
 *   addAlias: (alias: string, keyword: string) => Promise<{ id: number, alias: string, keyword: string }>,
 *   removeAlias: (aliasId: number) => Promise<void>,
 * }}
 *
 * Logic:
 *   - On mount, GET /api/v1/user/voice-aliases and populate the aliases list.
 *     Only the array under the `data` key is stored; any non-array response (e.g.
 *     an unexpected server error body) is silently replaced with an empty array so
 *     VoiceAliasManager never receives a non-iterable value.
 *   - addAlias POSTs the new alias and merges the server response into state
 *     (sorted alphabetically) without a re-fetch.
 *   - removeAlias applies an optimistic delete immediately, then fires the DELETE
 *     request; on failure it rolls back by re-fetching the full list.
 *   - All errors from addAlias are re-thrown so callers can surface them (e.g.,
 *     duplicate alias validation from the server).
 */
export default function useVoiceAliases() {
    const [aliases, setAliases] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAliases = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const { data } = await axios.get('/api/v1/user/voice-aliases');
            setAliases(Array.isArray(data.data) ? data.data : []);
        } catch {
            setError('Failed to load voice aliases.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Add a new voice alias for the authenticated user.
     *
     * @param {string} alias   The misheard word from voice recognition.
     * @param {string} keyword The intended replacement word.
     * @return {Promise<{ id: number, alias: string, keyword: string }>}
     *
     * Logic: POSTs to the API, then merges the returned record into the sorted
     *   alias list. Throws on validation errors so the caller can display them.
     */
    const addAlias = useCallback(async (alias, keyword) => {
        const { data } = await axios.post('/api/v1/user/voice-aliases', { alias, keyword });
        const created = data.data ?? data;
        setAliases((prev) =>
            [...prev, created].sort((a, b) => a.alias.localeCompare(b.alias))
        );
        return created;
    }, []);

    /**
     * Remove a voice alias by ID.
     *
     * @param {number} aliasId The ID of the alias to delete.
     * @return {Promise<void>}
     *
     * Logic: Removes the alias from state immediately (optimistic update) then
     *   fires the DELETE request. On failure, rolls back state by re-fetching
     *   the full list from the server.
     */
    const removeAlias = useCallback(async (aliasId) => {
        setAliases((prev) => prev.filter((a) => a.id !== aliasId));
        try {
            await axios.delete(`/api/v1/user/voice-aliases/${aliasId}`);
        } catch {
            await fetchAliases();
        }
    }, [fetchAliases]);

    useEffect(() => {
        fetchAliases();
    }, [fetchAliases]);

    return { aliases, isLoading, error, addAlias, removeAlias };
}
