import axios from 'axios';
import { createPortal } from 'react-dom';
import { startTransition, useEffect, useRef, useState } from 'react';
import Checkbox from '@/Components/Checkbox';
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
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [dropdownRect, setDropdownRect] = useState(null);
    const dropdownAnchorRef = useRef(null);

    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteUsers, setInviteUsers] = useState([]);
    const [inviteMeta, setInviteMeta] = useState({ current_page: 1, last_page: 1 });
    const [isInviteLoading, setIsInviteLoading] = useState(false);
    const [inviteLoadError, setInviteLoadError] = useState('');
    const [selectedInviteUserIds, setSelectedInviteUserIds] = useState(new Set());

    const selectedGame = games.find((g) => String(g.id) === selectedGameId) ?? null;

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
        onGameSelect(selectedGame);
    }, [selectedGame, onGameSelect]);

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
        if (! selectedGame) {
            return;
        }

        setForm({ name: selectedGame.name, targetPoints: String(selectedGame.target_points) });
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

    const fetchInviteUsers = async (gameId, page) => {
        setIsInviteLoading(true);
        setInviteLoadError('');

        try {
            const response = await axios.get(`/api/v1/games/${gameId}/invitable-users`, {
                params: { page },
            });
            const payload = response.data?.data?.users ?? {};

            startTransition(() => {
                setInviteUsers(payload.data ?? []);
                setInviteMeta({
                    current_page: payload.meta?.current_page ?? 1,
                    last_page: payload.meta?.last_page ?? 1,
                });
            });
        } catch {
            setInviteLoadError('Unable to load users right now.');
        } finally {
            setIsInviteLoading(false);
        }
    };

    const openInviteModal = () => {
        if (! selectedGame) {
            return;
        }

        setSelectedInviteUserIds(new Set());
        setInviteUsers([]);
        setInviteMeta({ current_page: 1, last_page: 1 });
        setIsInviteModalOpen(true);
        fetchInviteUsers(selectedGame.id, 1);
    };

    const closeInviteModal = () => {
        setIsInviteModalOpen(false);
    };

    const handleInvitePageChange = (newPage) => {
        if (! selectedGame) {
            return;
        }

        fetchInviteUsers(selectedGame.id, newPage);
    };

    const toggleInviteUser = (userId) => {
        setSelectedInviteUserIds((current) => {
            const next = new Set(current);

            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }

            return next;
        });
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
                    { ...createdGame, user_role: 'creator' },
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

    const gameRoleIcon = (role) => {
        if (role === 'creator') {
            return (
                <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-amber-300"
                    title="Creator"
                >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                </span>
            );
        }

        if (role === 'viewer') {
            return (
                <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 ring-1 ring-indigo-300"
                    title="Viewer"
                >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                    </svg>
                </span>
            );
        }

        if (role === 'pending_invitee') {
            return (
                <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-300"
                    title="Pending invite"
                >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
                    </svg>
                </span>
            );
        }

        return null;
    };

    return (
        <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
                <div className="relative border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.24),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                    {selectedGame?.user_role === 'creator' && (
                        <button
                            aria-label="Invite a viewer to this game"
                            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 sm:right-6 sm:top-6"
                            onClick={openInviteModal}
                            type="button"
                        >
                            <svg
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                            >
                                <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM3 20a6 6 0 0 1 12 0v1H3v-1z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Invite Viewer
                        </button>
                    )}

                    {selectedGame?.user_role === 'pending_invitee' && (
                        <button
                            aria-label="Accept invitation to this game"
                            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:right-6 sm:top-6"
                            type="button"
                        >
                            <svg
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                            >
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Accept Invite
                        </button>
                    )}

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
                            <div className="relative w-full" ref={dropdownAnchorRef}>
                                {isDropdownOpen && (
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setIsDropdownOpen(false)}
                                    />
                                )}

                                <button
                                    id="game-selector"
                                    type="button"
                                    role="combobox"
                                    aria-haspopup="listbox"
                                    aria-expanded={isDropdownOpen}
                                    aria-controls="game-listbox"
                                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isLoading || games.length === 0}
                                    onClick={() => {
                                        const rect = dropdownAnchorRef.current?.getBoundingClientRect();
                                        setDropdownRect(rect ?? null);
                                        setIsDropdownOpen((o) => !o);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setIsDropdownOpen(false);
                                        }
                                    }}
                                >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        {selectedGame === null ? (
                                            <span className="text-slate-400">
                                                {isLoading
                                                    ? 'Loading games\u2026'
                                                    : games.length === 0
                                                      ? 'No games available'
                                                      : 'Select a game'}
                                            </span>
                                        ) : (
                                            <>
                                                {gameRoleIcon(selectedGame.user_role)}
                                                <span className="min-w-0 truncate text-slate-900">
                                                    {selectedGame.name}{' '}
                                                    <span className="text-slate-400">
                                                        ({selectedGame.target_points} pts)
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                    </span>
                                    <svg
                                        aria-hidden="true"
                                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>

                                {isDropdownOpen && games.length > 0 && dropdownRect && createPortal(
                                    <ul
                                        id="game-listbox"
                                        role="listbox"
                                        style={{
                                            position: 'fixed',
                                            top: dropdownRect.bottom + 6,
                                            left: dropdownRect.left,
                                            width: dropdownRect.width,
                                        }}
                                        className="z-50 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
                                    >
                                        <li
                                            role="option"
                                            aria-label="Select a game"
                                            aria-selected={selectedGameId === ''}
                                            className={`cursor-pointer px-4 py-2.5 text-sm italic text-slate-400 hover:bg-slate-50 ${selectedGameId === '' ? 'bg-slate-50' : ''}`}
                                            onClick={() => {
                                                setSelectedGameId('');
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            Select a game
                                        </li>

                                        {games.map((game) => (
                                            <li
                                                key={game.id}
                                                role="option"
                                                aria-label={`${game.name} (${game.target_points} pts)`}
                                                aria-selected={String(game.id) === selectedGameId}
                                                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 ${String(game.id) === selectedGameId ? 'bg-indigo-50' : ''}`}
                                                onClick={() => {
                                                    setSelectedGameId(String(game.id));
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    {gameRoleIcon(game.user_role)}
                                                    <span className="truncate font-medium text-slate-800">
                                                        {game.name}
                                                    </span>
                                                </div>
                                                <span className="shrink-0 text-xs text-slate-400">
                                                    {game.target_points} pts
                                                </span>
                                            </li>
                                        ))}
                                    </ul>,
                                    document.body,
                                )}
                            </div>

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

            <Modal maxWidth="lg" onClose={closeInviteModal} show={isInviteModalOpen}>
                <div className="space-y-4 p-6">
                    <div className="space-y-1">
                        <h4 className="text-lg font-semibold text-slate-900">
                            Invite a Viewer
                        </h4>
                        <p className="text-sm text-slate-600">
                            Select the users you want to invite as viewers to this game.
                        </p>
                    </div>

                    {isInviteLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <svg
                                aria-label="Loading users"
                                className="h-6 w-6 animate-spin text-indigo-500"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    fill="currentColor"
                                />
                            </svg>
                        </div>
                    ) : inviteLoadError !== '' ? (
                        <p className="py-4 text-center text-sm font-medium text-red-600">
                            {inviteLoadError}
                        </p>
                    ) : inviteUsers.length === 0 ? (
                        <p className="py-4 text-center text-sm text-slate-500">
                            No users available to invite.
                        </p>
                    ) : (
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" role="list">
                            {inviteUsers.map((user) => (
                                <li key={user.id}>
                                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                                        <Checkbox
                                            checked={selectedInviteUserIds.has(user.id)}
                                            id={`invite-user-${user.id}`}
                                            onChange={() => toggleInviteUser(user.id)}
                                        />
                                        <span className="text-sm text-slate-800">
                                            {user.name}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}

                    {! isInviteLoading && inviteUsers.length > 0 && inviteMeta.last_page > 1 && (
                        <div className="flex items-center justify-between pt-1">
                            <button
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={inviteMeta.current_page <= 1}
                                onClick={() => handleInvitePageChange(inviteMeta.current_page - 1)}
                                type="button"
                            >
                                <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Prev
                            </button>

                            <span className="text-xs text-slate-500">
                                Page {inviteMeta.current_page} of {inviteMeta.last_page}
                            </span>

                            <button
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={inviteMeta.current_page >= inviteMeta.last_page}
                                onClick={() => handleInvitePageChange(inviteMeta.current_page + 1)}
                                type="button"
                            >
                                Next
                                <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-1">
                        <SecondaryButton onClick={closeInviteModal} type="button">
                            Close
                        </SecondaryButton>

                        <PrimaryButton type="button">
                            Send
                        </PrimaryButton>
                    </div>
                </div>
            </Modal>
        </>
    );
}
