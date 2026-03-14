import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

vi.mock('axios');

function TestComp({ selectedGame }) {
    const [elements, setElements] = useState([]);
    const [baseInputs, setBaseInputs] = useState({});
    const [cache, setCache] = useState({});
    const draftLoaded = useRef(false);
    const timerRef = useRef(null);

    // Fetch elements
    useEffect(() => {
        axios.get('/api/v1/base-elements').then(r => {
            setElements(r.data?.data?.base_elements ?? []);
        });
    }, []);

    // Game change reset - THE SUSPECTED CAUSE
    useEffect(() => {
        setCache({});
    }, [selectedGame?.id]);

    // Draft load
    useEffect(() => {
        if (!selectedGame?.id || elements.length === 0) return;
        draftLoaded.current = false;
        axios.get(`/api/v1/games/${selectedGame.id}/round-draft`)
            .catch(() => { })
            .finally(() => { draftLoaded.current = true; });
    }, [selectedGame?.id, elements.length]);

    // Auto-save
    useEffect(() => {
        if (!draftLoaded.current || !selectedGame?.id) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            axios.put(`/api/v1/games/${selectedGame.id}/draft`, { baseInputs })
                .catch(() => {});
        }, 800);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [baseInputs]);

    if (!selectedGame) return <p>No game</p>;
    return <p>Ready</p>;
}

const selectedGame = { id: 5 };

describe('minimal hang', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        axios.get.mockResolvedValue({ data: { data: { base_elements: [{ id: 1 }] } } });
    });

    it('works', async () => {
        render(<TestComp selectedGame={selectedGame} />);
        await screen.findByText('Ready');
    });
});


