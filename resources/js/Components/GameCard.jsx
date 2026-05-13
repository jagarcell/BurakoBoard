import api from '@/api/client';
import { formatDefaultGameName } from '@/utils/formatGameName';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import useVisibilityRefresh from '@/hooks/useVisibilityRefresh';
import useEchoReconnect from '@/hooks/useEchoReconnect';
import Checkbox from '@/Components/Checkbox';
import CreateGameModal from '@/Components/CreateGameModal';
import DelegateHostModal from '@/Components/DelegateHostModal';
import EditGameModal from '@/Components/EditGameModal';
import ExtendGameModal from '@/Components/ExtendGameModal';
import InvitationPopup from '@/Components/InvitationPopup';
import InviteUsersModal from '@/Components/InviteUsersModal';
import RematchHistoryModal from '@/Components/RematchHistoryModal';
import NotificationBell from '@/Components/NotificationBell';
import PrimaryButton from '@/Components/PrimaryButton';

const defaultForm = {
    name: '',
    targetPoints: '2000',
};

const STORAGE_KEY = 'burako_selected_game_id';

export default function GameCard({ onGameSelect = () => {}, preselectedGameId = null, selectedGameStatus = null }) {
    const { auth: { user }, hasPendingInvitations } = usePage().props;
    const [games, setGames] = useState([]);
    const [selectedGameId, setSelectedGameId] = useState(
        () => localStorage.getItem(STORAGE_KEY) ?? '',
    );
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [form, setForm] = useState(defaultForm);
    const [errors, setErrors] = useState({});
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [dropdownRect, setDropdownRect] = useState(null);
    const dropdownAnchorRef = useRef(null);

    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isDelegateHostModalOpen, setIsDelegateHostModalOpen] = useState(false);

    const [acceptingGameIds, setAcceptingGameIds] = useState(() => new Set());
    const [hasPending, setHasPending] = useState(hasPendingInvitations);
    const [acceptInviteError, setAcceptInviteError] = useState('');
    const [isFetchingInvitations, setIsFetchingInvitations] = useState(false);
    const [pendingGames, setPendingGames] = useState([]);

    const [includeFinishedGames, setIncludeFinishedGames] = useState(
        () => localStorage.getItem(`burako_include_finished_${user?.id}`) !== 'false',
    );

    const [isRematch, setIsRematch] = useState(false);
    const [rematchSourceId, setRematchSourceId] = useState(null);

    const [isRematchHistoryOpen, setIsRematchHistoryOpen] = useState(false);

    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [extendTargetPoints, setExtendTargetPoints] = useState('');
    const [isExtending, setIsExtending] = useState(false);
    const [extendErrors, setExtendErrors] = useState({});

    const [latestInvitation, setLatestInvitation] = useState(null);
    const [showInvitationPopup, setShowInvitationPopup] = useState(false);

    // Auto-close the popup when the invitation it is showing has been accepted
    // (i.e. the game is no longer in pendingGames).
    useEffect(() => {
        if (
            showInvitationPopup &&
            latestInvitation !== null &&
            !pendingGames.some((g) => String(g.id) === String(latestInvitation.id))
        ) {
            setShowInvitationPopup(false);
        }
    }, [pendingGames, latestInvitation, showInvitationPopup]);

    const selectedGame = games.find((g) => String(g.id) === selectedGameId) ?? null;

    const visibleGames = includeFinishedGames
        ? games
        : games.filter((g) => g.status !== 'finished');

    const fetchGames = useCallback(async () => {
        setIsLoading(true);
        setLoadError('');

        try {
            const response = await api.get('/games');
            const availableGames = response.data?.data?.games ?? [];

            setGames(availableGames);
            setSelectedGameId((currentGameId) => {
                // URL-specified preselect takes priority over localStorage.
                if (
                    preselectedGameId !== null &&
                    availableGames.some(
                        (game) => String(game.id) === String(preselectedGameId),
                    )
                ) {
                    return String(preselectedGameId);
                }

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
        } catch {
            setLoadError('Unable to load games right now.');
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- safe: preselectedGameId is a one-time URL param; setters are stable
    }, [preselectedGameId]);

    // Initial load.
    useEffect(() => {
        fetchGames();
    }, [fetchGames]);

    useEffect(() => {
        if (selectedGameId !== '') {
            localStorage.setItem(STORAGE_KEY, selectedGameId);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [selectedGameId]);

    // Subscribe to the game channel for the currently selected game so that when
    // another user (or the same user in another tab) deletes the game, this UI
    // resets the dropdown to the placeholder option in real time.
    useEffect(() => {
        if (! selectedGameId || typeof window === 'undefined' || ! window.Echo) return;

        const echo = window.Echo;
        const gameId = selectedGameId;

        echo.private(`game.${gameId}`)
            .listen('.game.deleted', () => {
                setGames((current) => current.filter((g) => String(g.id) !== gameId));
                setSelectedGameId('');
            });

        return () => {
            // Defer the leave by 300 ms so the Pusher channel remains subscribed
            // long enough for RoundsCard's cleanup (which runs in the next render
            // cycle, after Dashboard propagates the new selectedGame) to whisper
            // 'creatorInactive' before the channel is torn down.  Calling
            // echo.leave() synchronously here destroys the channel in the same
            // render pass as GameCard's selectedGameId change — before
            // selectedGame even propagates to Dashboard/RoundsCard.
            setTimeout(() => {
                echo.leave(`game.${gameId}`);
            }, 300);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedGameId is the only dependency that drives channel (re)subscription; other referenced values (echo, setGames) are stable
    }, [selectedGameId]);

    // Subscribe to the authenticated user's private notification channel to receive
    // real-time role changes.  When the current user is promoted to host (creator)
    // by the previous host, the `.game.role.updated` event arrives here and the
    // affected game's user_role is updated in local state immediately — no HTTP
    // re-fetch or page reload required.
    useEffect(() => {
        if (! user?.id || typeof window === 'undefined' || ! window.Echo) return;

        const channel = window.Echo.private(`App.Models.User.${user.id}`);

        channel.listen('.game.role.updated', ({ game_id, new_role }) => {
            setGames((current) =>
                current.map((g) =>
                    String(g.id) === String(game_id) ? { ...g, user_role: new_role } : g,
                ),
            );
        });

        return () => {
            channel.stopListening('.game.role.updated');
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user.id is the only value that identifies which private channel to subscribe to; setGames is a stable setter
    }, [user?.id]);

    // When Dashboard's authoritative game state marks the selected game as finished
    // (e.g. because the current user just recorded the final round), mirror that
    // status change into the local games array so the rematch button appears
    // immediately without requiring a page refresh.
    useEffect(() => {
        if (! selectedGameStatus) return;
        const { id, status } = selectedGameStatus;

        setGames((current) =>
            current.map((g) =>
                String(g.id) === String(id) ? { ...g, status } : g,
            ),
        );
    }, [selectedGameStatus?.id, selectedGameStatus?.status]);

    useEffect(() => {
        setAcceptInviteError('');
        onGameSelect(selectedGame);
    }, [selectedGame, onGameSelect]);

    const resetForm = () => {
        setForm(defaultForm);
        setErrors({});
    };

    const openCreateModal = () => {
        setIsRematch(false);
        setRematchSourceId(null);
        resetForm();
        setForm((f) => ({ ...f, name: formatDefaultGameName() }));
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        if (isSaving) {
            return;
        }

        setIsCreateModalOpen(false);
        setIsRematch(false);
        setRematchSourceId(null);
        resetForm();
    };

    const openRematchModal = (game) => {
        setIsRematch(true);
        setRematchSourceId(game.id);
        setErrors({});
        setForm({ name: formatDefaultGameName(), targetPoints: String(game.target_points) });
        setIsCreateModalOpen(true);
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
        if (isSaving || isDeleting) {
            return;
        }

        setIsEditModalOpen(false);
        resetForm();
    };

    const openExtendModal = (game) => {
        setExtendTargetPoints(String((game.target_points ?? 0) + 500));
        setExtendErrors({});
        setIsExtendModalOpen(true);
    };

    const closeExtendModal = () => {
        if (isExtending) {
            return;
        }

        setIsExtendModalOpen(false);
        setExtendTargetPoints('');
        setExtendErrors({});
    };

    const handleExtendGame = async (event) => {
        event.preventDefault();
        setExtendErrors({});

        const targetPoints = Number(extendTargetPoints);

        if (Number.isNaN(targetPoints) || targetPoints < 1) {
            setExtendErrors({
                target_points: 'Winning score must be at least 1.',
            });

            return;
        }

        setIsExtending(true);

        try {
            const response = await api.patch(`/games/${selectedGameId}/extend`, {
                target_points: targetPoints,
            });
            const updatedGame = response.data?.data?.game;

            if (! updatedGame) {
                throw new Error('Game payload missing from response.');
            }

            setGames((currentGames) =>
                currentGames.map((game) =>
                    String(game.id) === String(updatedGame.id) ? updatedGame : game,
                ),
            );

            setIsExtendModalOpen(false);
            setExtendTargetPoints('');
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};

            setExtendErrors({
                target_points: apiErrors.target_points?.[0],
                general:
                    apiErrors.target_points?.[0] ||
                    'Unable to extend the game right now.',
            });
        } finally {
            setIsExtending(false);
        }
    };

    const openInviteModal = () => {
        if (! selectedGame) {
            return;
        }

        setIsInviteModalOpen(true);
    };

    const closeInviteModal = () => {
        setIsInviteModalOpen(false);
    };

    const handleDelegateHostSuccess = (updatedGame) => {
        setGames((currentGames) =>
            currentGames.map((g) =>
                String(g.id) === String(updatedGame.id) ? updatedGame : g,
            ),
        );
    };

    const fetchPendingInvitations = useCallback(async () => {
        setIsFetchingInvitations(true);

        try {
            const response = await api.get('/invitations');
            const freshPending = response.data?.data?.invitations ?? [];

            setPendingGames(freshPending);
            setHasPending(freshPending.length > 0);

            return freshPending;
        } catch {
            // Silent failure — existing list remains displayed.
        } finally {
            setIsFetchingInvitations(false);
        }

        return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- safe: all setters are stable useState dispatchers; api is a module-level stable import
    }, []);

    // Re-sync when the user returns from a locked screen or switches back to the tab.
    useVisibilityRefresh(useCallback(() => {
        fetchGames();
        if (hasPending) {
            fetchPendingInvitations();
        }
    }, [fetchGames, fetchPendingInvitations, hasPending]));

    // Re-sync when the Pusher socket reconnects after an iOS background/foreground cycle.
    useEchoReconnect(useCallback(() => {
        fetchGames();
        if (hasPending) {
            fetchPendingInvitations();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- safe: fetchGames and fetchPendingInvitations are stable; hasPending is captured via ref semantics in the hook
    }, [fetchGames, fetchPendingInvitations, hasPending]));

    const handleNewInvitation = async () => {
        setHasPending(true);
        const freshPending = await fetchPendingInvitations();

        if (freshPending.length > 0) {
            setLatestInvitation(freshPending[0]);
            setShowInvitationPopup(true);
        }
    };

    const handleAcceptInvite = async (gameId) => {
        if (acceptingGameIds.has(gameId)) {
            return;
        }

        setAcceptingGameIds((prev) => new Set([...prev, gameId]));
        setAcceptInviteError('');

        try {
            const response = await api.put(`/games/${gameId}/invitation`);
            const updatedGame = response.data?.data?.game;

            if (! updatedGame) {
                throw new Error('Game payload missing from response.');
            }

            setPendingGames((currentPending) => {
                const updated = currentPending.filter(
                    (g) => String(g.id) !== String(updatedGame.id),
                );
                setHasPending(updated.length > 0);
                return updated;
            });
            setGames((currentGames) => {
                if (currentGames.some((g) => String(g.id) === String(updatedGame.id))) {
                    return currentGames.map((g) =>
                        String(g.id) === String(updatedGame.id) ? updatedGame : g,
                    );
                }

                return [updatedGame, ...currentGames];
            });
            setSelectedGameId(String(updatedGame.id));
        } catch {
            setAcceptInviteError('Unable to accept the invitation right now. Please try again.');
        } finally {
            setAcceptingGameIds((prev) => {
                const next = new Set(prev);
                next.delete(gameId);
                return next;
            });
        }
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
            const response = await api.put(`/games/${selectedGameId}`, {
                name: trimmedName,
                target_points: targetPoints,
            });
            const updatedGame = response.data?.data?.game;

            if (! updatedGame) {
                throw new Error('Game payload missing from response.');
            }

            setGames((currentGames) =>
                currentGames.map((game) =>
                    String(game.id) === String(updatedGame.id) ? updatedGame : game,
                ),
            );

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

    const handleDeleteGame = async () => {
        if (! window.confirm('Are you sure you want to delete this game? This action cannot be undone.')) {
            return;
        }

        setIsDeleting(true);
        setErrors({});

        try {
            await api.delete(`/games/${selectedGameId}`);

            setGames((currentGames) =>
                currentGames.filter((game) => String(game.id) !== selectedGameId),
            );
            setSelectedGameId('');

            setIsEditModalOpen(false);
            resetForm();
        } catch {
            setErrors({
                general: 'Unable to delete the game right now.',
            });
        } finally {
            setIsDeleting(false);
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
            const endpoint = isRematch
                ? `/games/${rematchSourceId}/rematch`
                : '/games';

            const response = await api.post(endpoint, {
                name: trimmedName,
                target_points: targetPoints,
            });
            const createdGame = response.data?.data?.game?.game;

            if (! createdGame) {
                throw new Error('Game payload missing from response.');
            }

            // Immediately mark the source game as has_rematch: true so the Rematch
            // button disappears the instant the modal closes.
            if (isRematch) {
                setGames((currentGames) =>
                    currentGames.map((g) =>
                        String(g.id) === String(rematchSourceId) ? { ...g, has_rematch: true } : g,
                    ),
                );
            }

            setGames((currentGames) => [
                { ...createdGame, user_role: 'creator' },
                ...currentGames.filter((game) => game.id !== createdGame.id),
            ]);
            setSelectedGameId(String(createdGame.id));

            setIsCreateModalOpen(false);
            setIsRematch(false);
            setRematchSourceId(null);
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

        return null;
    };

    return (
        <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
                <div className="relative border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.24),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                    <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
                        {(selectedGame?.has_rematch || selectedGame?.rematch_from_game_id) && (
                            <button
                                aria-label="View rematch history for this game"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
                                onClick={() => setIsRematchHistoryOpen(true)}
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
                                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                History
                            </button>
                        )}

                        {selectedGame?.user_role === 'creator' && selectedGame?.status === 'finished' && !selectedGame?.has_rematch && (
                            <button
                                aria-label="Start a rematch of this game"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                onClick={() => openRematchModal(selectedGame)}
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
                                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Rematch
                            </button>
                        )}

                        {selectedGame?.user_role === 'creator' && selectedGame?.status === 'finished' && (
                            <button
                                aria-label="Extend this game with a new points goal"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                                onClick={() => openExtendModal(selectedGame)}
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
                                    <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Extend
                            </button>
                        )}

                        {selectedGame?.user_role === 'creator' && selectedGame?.status !== 'finished' && (
                            <button
                                aria-label="Delegate host role to a viewer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                onClick={() => setIsDelegateHostModalOpen(true)}
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
                                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M19 12l2 2-2 2M21 14h-4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Delegate Host
                            </button>
                        )}

                        {selectedGame?.user_role === 'creator' && selectedGame?.status !== 'finished' && (
                            <button
                                aria-label="Invite a viewer to this game"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                    </div>

                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                                    Game Hub
                                </p>
                                <NotificationBell
                                    userId={user?.id}
                                    hasPending={hasPending}
                                    pendingGames={pendingGames}
                                    onNewInvitation={handleNewInvitation}
                                    onAcceptInvitation={handleAcceptInvite}
                                    acceptingGameIds={acceptingGameIds}
                                    onOpen={() => {
                                        setShowInvitationPopup(false);
                                        fetchPendingInvitations();
                                    }}
                                    isLoadingGames={isFetchingInvitations}
                                />
                            </div>
                            <h3 className="text-2xl font-semibold text-slate-900">
                                Choose an existing game or open a fresh table.
                            </h3>
                            <p className="text-sm text-slate-600">
                                The dashboard keeps the selected game in focus and
                                lets you create the next one without leaving the page.
                            </p>
                        </div>

                        <div className="flex w-full flex-col gap-1.5 lg:max-w-2xl">
                            <label className="flex cursor-pointer items-center gap-2 self-start" htmlFor="include-finished-games">
                                <Checkbox
                                    id="include-finished-games"
                                    checked={includeFinishedGames}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setIncludeFinishedGames(checked);
                                        localStorage.setItem(`burako_include_finished_${user?.id}`, String(checked));
                                        if (!checked && selectedGame?.status === 'finished') {
                                            setSelectedGameId('');
                                        }
                                    }}
                                />
                                <span className="select-none text-sm text-slate-600">Include finished games</span>
                            </label>

                            <div className="flex w-full flex-col gap-3 sm:flex-row lg:items-center">
                                <label className="sr-only" htmlFor="game-selector">
                                    Select or create a game
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
                                                      : 'Select or create a game'}
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

                                {isDropdownOpen && visibleGames.length > 0 && dropdownRect && createPortal(
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
                                            aria-label="Select or create a game"
                                            aria-selected={selectedGameId === ''}
                                            className={`cursor-pointer px-4 py-2.5 text-sm italic text-slate-400 hover:bg-slate-50 ${selectedGameId === '' ? 'bg-slate-50' : ''}`}
                                            onClick={() => {
                                                setSelectedGameId('');
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            Select or create a game
                                        </li>

                                        {visibleGames.map((game) => (
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
                            ) : selectedGame?.user_role !== 'viewer' ? (
                                <PrimaryButton
                                    className="min-h-12 justify-center rounded-2xl px-6 text-[11px]"
                                    onClick={openEditModal}
                                    type="button"
                                >
                                    Edit
                                </PrimaryButton>
                            ) : null}
                            </div>
                        </div>
                    </div>

                    {loadError !== '' ? (
                        <p className="mt-4 text-sm font-medium text-red-600">
                            {loadError}
                        </p>
                    ) : null}

                    {acceptInviteError !== '' ? (
                        <p className="mt-4 text-sm font-medium text-red-600">
                            {acceptInviteError}
                        </p>
                    ) : null}
                </div>
            </section>

            <InvitationPopup
                game={latestInvitation}
                isVisible={showInvitationPopup}
                isAccepting={latestInvitation !== null && acceptingGameIds.has(latestInvitation.id)}
                onAccept={handleAcceptInvite}
                onClose={() => setShowInvitationPopup(false)}
            />

            <RematchHistoryModal
                isOpen={isRematchHistoryOpen}
                onClose={() => setIsRematchHistoryOpen(false)}
                gameId={selectedGame?.id ?? null}
                currentGameId={selectedGame?.id ?? null}
                onSelectGame={(id) => {
                    setSelectedGameId(String(id));
                    setIsRematchHistoryOpen(false);
                }}
            />

            <EditGameModal
                isOpen={isEditModalOpen}
                onClose={closeEditModal}
                game={selectedGame}
                form={form}
                errors={errors}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onChange={(field, val) => setForm((f) => ({ ...f, [field]: val }))}
                onSubmit={handleEditGame}
                onDelete={handleDeleteGame}
            />

            <CreateGameModal
                isOpen={isCreateModalOpen}
                onClose={closeCreateModal}
                isRematch={isRematch}
                form={form}
                errors={errors}
                isSaving={isSaving}
                onChange={(field, val) => setForm((f) => ({ ...f, [field]: val }))}
                onSubmit={handleCreateGame}
            />

            <InviteUsersModal
                isOpen={isInviteModalOpen}
                onClose={closeInviteModal}
                gameId={selectedGame?.id ?? null}
            />

            <DelegateHostModal
                isOpen={isDelegateHostModalOpen}
                onClose={() => setIsDelegateHostModalOpen(false)}
                gameId={selectedGame?.id ?? null}
                onSuccess={handleDelegateHostSuccess}
            />

            <ExtendGameModal
                isOpen={isExtendModalOpen}
                onClose={closeExtendModal}
                game={selectedGame}
                targetPoints={extendTargetPoints}
                errors={extendErrors}
                isExtending={isExtending}
                onChange={setExtendTargetPoints}
                onSubmit={handleExtendGame}
            />
        </>
    );
}
