import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import GameCard from '@/Components/GameCard';

vi.mock('axios');

describe('GameCard', () => {
    it('loads existing games and selects a different one from the dropdown', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    games: [
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
                    ],
                },
            },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const selector = await screen.findByRole('combobox');

        await waitFor(() =>
            expect(selector).toHaveValue('8'),
        );
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
            data: {
                data: {
                    games: [
                        {
                            id: 1,
                            name: 'Existing Table',
                            target_points: 2000,
                            status: 'in_progress',
                            winning_team_id: null,
                            current_round_number: 0,
                        },
                    ],
                },
            },
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
});
