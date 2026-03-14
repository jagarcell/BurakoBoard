import axios from 'axios';
import { startTransition, useEffect, useState } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

const defaultForm = {
    name: '',
    targetPoints: '2000',
};

const STORAGE_KEY = 'burako_selected_game_id';

export default function GameCard({ onGameSelect = () => {} }) {
    const [games, setGames] = useState([]);
    const [selectedGameId, setSelectedGameId] = useState(
        () => localStorage.getItem(STORAGE_KEY) ?? '',
    );
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(defaultForm);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        let isActive = true;

        const fetchGames = async () => {
            setIsLoading(true);
            setLoadError('');

            try {
                const response = await axios.get('/api/v1/games');
                const availableGames = response.data?.data?.games ?? [];

                if (! isActive) {
                    return;
                }

                startTransition(() => {
                    setGames(availableGames);
                    setSelectedGameId((currentGameId) => {
                        if (
                            currentGameId !== '' &&
                            availableGames.some(
                                (game) => String(game.id) === currentGameId,
                            )
                        ) {
                            return currentGameId;
                        }

                        return '';
                    });
                });
            } catch (error) {
                if (! isActive) {
                    return;
                }

                setLoadError('Unable to load games right now.');
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        fetchGames();

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (selectedGameId !== '') {
            localStorage.setItem(STORAGE_KEY, selectedGameId);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [selectedGameId]);

    useEffect(() => {
        const selectedGame = games.find(
            (game) => String(game.id) === selectedGameId,
        );

        onGameSelect(selectedGame ?? null);
    }, [games, onGameSelect, selectedGameId]);

    const resetForm = () => {
        setForm(defaultForm);
        setErrors({});
    };

    const openCreateModal = () => {
        resetForm();
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        if (isSaving) {
            return;
        }

        setIsCreateModalOpen(false);
        resetForm();
    };

    const openEditModal = () => {
        const game = games.find((g) => String(g.id) === selectedGameId);

        if (! game) {
            return;
        }

        setForm({ name: game.name, targetPoints: String(game.target_points) });
        setErrors({});
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        if (isSaving) {
            return;
        }

        setIsEditModalOpen(false);
        resetForm();
    };

    const handleEditGame = async (event) => {
        event.preventDefault();
        setErrors({});

        const trimmedName = form.name.trim();
        const targetPoints = Number(form.targetPoints);

        if (trimmedName === '' || Number.isNaN(targetPoints) || targetPoints < 1) {
            setErrors({
                name: trimmedName === '' ? 'A game name is required.' : undefined,
                target_points:
                    Number.isNaN(targetPoints) || targetPoints < 1
                        ? 'Winning score must be at least 1.'
                        : undefined,
            });

            return;
        }

        setIsSaving(true);

        try {
            const response = await axios.put(`/api/v1/games/${selectedGameId}`, {
                name: trimmedName,
                target_points: targetPoints,
            });
            const updatedGame = response.data?.data?.game;

            if (! updatedGame) {
                throw new Error('Game payload missing from response.');
            }

            startTransition(() => {
                setGames((currentGames) =>
                    currentGames.map((game) =>
                        String(game.id) === String(updatedGame.id) ? updatedGame : game,
                    ),
                );
            });

            setIsEditModalOpen(false);
            resetForm();
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};

            setErrors({
                name: apiErrors.name?.[0],
                target_points: apiErrors.target_points?.[0],
                general:
                    apiErrors.name?.[0] ||
                    apiErrors.target_points?.[0] ||
                    'Unable to update the game right now.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateGame = async (event) => {
        event.preventDefault();
        setErrors({});

        const trimmedName = form.name.trim();
        const targetPoints = Number(form.targetPoints);

        if (trimmedName === '' || Number.isNaN(targetPoints) || targetPoints < 1) {
            setErrors({
                name: trimmedName === '' ? 'A game name is required.' : undefined,
                target_points:
                    Number.isNaN(targetPoints) || targetPoints < 1
                        ? 'Winning score must be at least 1.'
                        : undefined,
            });

            return;
        }

        setIsSaving(true);

        try {
            const response = await axios.post('/api/v1/games', {
                name: trimmedName,
                target_points: targetPoints,
            });
            const createdGame = response.data?.data?.game?.game;

            if (! createdGame) {
                throw new Error('Game payload missing from response.');
            }

            startTransition(() => {
                setGames((currentGames) => [
                    createdGame,
                    ...currentGames.filter((game) => game.id !== createdGame.id),
                ]);
                setSelectedGameId(String(createdGame.id));
            });

            setIsCreateModalOpen(false);
            resetForm();
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};

            setErrors({
                name: apiErrors.name?.[0],
                target_points: apiErrors.target_points?.[0],
                general:
                    apiErrors.name?.[0] ||
                    apiErrors.target_points?.[0] ||
                    'Unable to create the game right now.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.24),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                                Game Hub
                            </p>
                            <h3 className="text-2xl font-semibold text-slate-900">
                                Choose an existing game or open a fresh table.
                            </h3>
                            <p className="text-sm text-slate-600">
                                The dashboard keeps the selected game in focus and
                                lets you create the next one without leaving the page.
                            </p>
                        </div>

                        <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl lg:items-center">
                            <label className="sr-only" htmlFor="game-selector">
                                Select a game
                            </label>
                            <select
                                id="game-selector"
                                className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                disabled={isLoading}
                                onChange={(event) => setSelectedGameId(event.target.value)}
                                value={selectedGameId}
                            >
                                {isLoading ? (
                                    <option value="">Loading games...</option>
                                ) : games.length === 0 ? (
                                    <option value="">No games available</option>
                                ) : (
                                    <option value="">Select a game</option>
                                )}

                                {games.map((game) => (
                                    <option key={game.id} value={String(game.id)}>
                                        {game.name} ({game.target_points} pts)
                                    </option>
                                ))}
                            </select>

                            {selectedGameId === '' ? (
                                <PrimaryButton
                                    className="min-h-12 justify-center rounded-2xl px-6 text-[11px]"
                                    onClick={openCreateModal}
                                    type="button"
                                >
                                    New
                                </PrimaryButton>
                            ) : (
                                <PrimaryButton
                                    className="min-h-12 justify-center rounded-2xl px-6 text-[11px]"
                                    onClick={openEditModal}
                                    type="button"
                                >
                                    Edit
                                </PrimaryButton>
                            )}
                        </div>
                    </div>

                    {loadError !== '' ? (
                        <p className="mt-4 text-sm font-medium text-red-600">
                            {loadError}
                        </p>
                    ) : null}
                </div>
            </section>

            <Modal maxWidth="lg" onClose={closeEditModal} show={isEditModalOpen}>
                <form className="space-y-6 p-6" onSubmit={handleEditGame}>
                    <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-slate-900">
                            Edit game
                        </h4>
                        <p className="text-sm text-slate-600">
                            Update the game name and the score required to declare a winner.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <InputLabel htmlFor="edit-game-name" value="Game name" />
                        <TextInput
                            className="block w-full rounded-xl"
                            id="edit-game-name"
                            isFocused
                            onChange={(event) =>
                                setForm((currentForm) => ({
                                    ...currentForm,
                                    name: event.target.value,
                                }))
                            }
                            placeholder="Friday Burako"
                            value={form.name}
                        />
                        <InputError message={errors.name} />
                    </div>

                    <div className="space-y-2">
                        <InputLabel
                            htmlFor="edit-game-target-points"
                            value="Winning score"
                        />
                        <TextInput
                            className="block w-full rounded-xl"
                            id="edit-game-target-points"
                            min="1"
                            onChange={(event) =>
                                setForm((currentForm) => ({
                                    ...currentForm,
                                    targetPoints: event.target.value,
                                }))
                            }
                            step="1"
                            type="number"
                            value={form.targetPoints}
                        />
                        <InputError message={errors.target_points} />
                    </div>

                    <InputError message={errors.general} />

                    <div className="flex justify-end gap-3">
                        <SecondaryButton
                            disabled={isSaving}
                            onClick={closeEditModal}
                            type="button"
                        >
                            Cancel
                        </SecondaryButton>

                        <PrimaryButton disabled={isSaving} type="submit">
                            Save
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>

            <Modal maxWidth="lg" onClose={closeCreateModal} show={isCreateModalOpen}>
                <form className="space-y-6 p-6" onSubmit={handleCreateGame}>
                    <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-slate-900">
                            Create a new game
                        </h4>
                        <p className="text-sm text-slate-600">
                            Enter the game name and the score required to declare a winner.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <InputLabel htmlFor="new-game-name" value="Game name" />
                        <TextInput
                            className="block w-full rounded-xl"
                            id="new-game-name"
                            isFocused
                            onChange={(event) =>
                                setForm((currentForm) => ({
                                    ...currentForm,
                                    name: event.target.value,
                                }))
                            }
                            placeholder="Friday Burako"
                            value={form.name}
                        />
                        <InputError message={errors.name} />
                    </div>

                    <div className="space-y-2">
                        <InputLabel
                            htmlFor="new-game-target-points"
                            value="Winning score"
                        />
                        <TextInput
                            className="block w-full rounded-xl"
                            id="new-game-target-points"
                            min="1"
                            onChange={(event) =>
                                setForm((currentForm) => ({
                                    ...currentForm,
                                    targetPoints: event.target.value,
                                }))
                            }
                            step="1"
                            type="number"
                            value={form.targetPoints}
                        />
                        <InputError message={errors.target_points} />
                    </div>

                    <InputError message={errors.general} />

                    <div className="flex justify-end gap-3">
                        <SecondaryButton
                            disabled={isSaving}
                            onClick={closeCreateModal}
                            type="button"
                        >
                            Cancel
                        </SecondaryButton>

                        <PrimaryButton disabled={isSaving} type="submit">
                            Accept
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
        </>
    );
}
