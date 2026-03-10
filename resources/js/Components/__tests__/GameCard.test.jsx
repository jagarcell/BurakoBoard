import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import GameCard from '@/Components/GameCard';

vi.mock('axios');

const twoGames = [
    {
        id: 8,
        name: 'Late Table',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
    },
    {
        id: 3,
        name: 'Early Table',
        target_points: 1500,
        status: 'finished',
        winning_team_id: 2,
        current_round_number: 4,
    },
];

const oneGame = [
    {
        id: 1,
        name: 'Existing Table',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
    },
];

describe('GameCard', () => {
    it('shows the Select a game placeholder and no auto-selection on load', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const selector = await screen.findByRole('combobox');
        await screen.findByRole('option', { name: 'Select a game' });

        await waitFor(() => expect(selector).toHaveValue(''));
        expect(screen.getByRole('option', { name: 'Select a game' })).toBeInTheDocument();

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('shows the New button when no game is selected and Edit button after selecting one', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const selector = await screen.findByRole('combobox');
        await screen.findByRole('option', { name: 'Select a game' });

        await waitFor(() => expect(selector).toHaveValue(''));
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

        await userEvent.selectOptions(selector, '8');

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('allows manual selection of a game from the dropdown', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const selector = await screen.findByRole('combobox');
        await screen.findAllByRole('option', { name: /pts/ });

        await userEvent.selectOptions(selector, '8');

        expect(selector).toHaveValue('8');
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 8, name: 'Late Table' }),
            ),
        );

        await userEvent.selectOptions(selector, '3');

        expect(selector).toHaveValue('3');
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 3, name: 'Early Table' }),
            ),
        );
    });

    it('creates a new game, closes the dialog, and selects the created game', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: oneGame } },
        });

        axios.post.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        game: {
                            id: 12,
                            name: 'Finals Table',
                            target_points: 3000,
                            status: 'in_progress',
                            winning_team_id: null,
                            current_round_number: 0,
                        },
                        teams: [],
                        rounds: [],
                    },
                },
            },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        await screen.findByRole('combobox');
        await screen.findByRole('option', { name: 'Select a game' });

        await userEvent.click(screen.getByRole('button', { name: 'New' }));

        await userEvent.type(screen.getByLabelText('Game name'), 'Finals Table');
        await userEvent.clear(screen.getByLabelText('Winner score'));
        await userEvent.type(screen.getByLabelText('Winner score'), '3000');
        await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games', {
                name: 'Finals Table',
                target_points: 3000,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByText('Create a new game')).not.toBeInTheDocument(),
        );

        expect(screen.getByRole('combobox')).toHaveValue('12');
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 12, name: 'Finals Table' }),
            ),
        );
    });

    it('opens the edit modal pre-populated, submits a PUT request, and updates the game in the list', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        axios.put.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        id: 8,
                        name: 'Late Table Renamed',
                        target_points: 2500,
                        status: 'in_progress',
                        winning_team_id: null,
                        current_round_number: 0,
                    },
                },
            },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const selector = await screen.findByRole('combobox');
        await screen.findAllByRole('option', { name: /pts/ });
        await userEvent.selectOptions(selector, '8');

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Edit game')).toBeInTheDocument();

        const nameInput = screen.getByLabelText('Game name');
        const scoreInput = screen.getByLabelText('Winner score');

        expect(nameInput).toHaveValue('Late Table');
        expect(scoreInput).toHaveValue(2000);

        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Late Table Renamed');
        await userEvent.clear(scoreInput);
        await userEvent.type(scoreInput, '2500');

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith('/api/v1/games/8', {
                name: 'Late Table Renamed',
                target_points: 2500,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByText('Edit game')).not.toBeInTheDocument(),
        );

        expect(
            screen.getByRole('option', { name: 'Late Table Renamed (2500 pts)' }),
        ).toBeInTheDocument();
    });

    it('keeps the selector on the placeholder option when returning to it after a selection', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const selector = await screen.findByRole('combobox');
        await screen.findAllByRole('option', { name: /pts/ });

        await userEvent.selectOptions(selector, '8');
        expect(selector).toHaveValue('8');

        await userEvent.selectOptions(selector, '');
        expect(selector).toHaveValue('');
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });
});
