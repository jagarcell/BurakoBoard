import api from '@/api/client';
import { normalizeName } from '@/utils/strings';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SeatedPlayerList from '@/Components/SeatedPlayerList';
import TextInput from '@/Components/TextInput';

const defaultTeamForm = { name: '', players: [] };
const defaultPlayerInput = { userId: '', name: '' };

/**
 * Modal for creating or editing a team within a game.
 *
 * @param {boolean}      props.isOpen            - Whether the modal is visible.
 * @param {function}     props.onClose           - Called to request the modal to close.
 * @param {object}       props.selectedGame      - The current game object.
 * @param {object|null}  props.editingTeam       - Team data to edit (null when creating).
 * @param {number|null}  props.creatingSlot      - Slot index (0 or 1) when creating in a specific slot.
 * @param {Array}        props.allTeams          - All globally known teams (for duplicate name check).
 * @param {Array}        props.existingTeams     - Teams already attached to this game.
 * @param {Array}        props.users             - Registered users for the player dropdown.
 * @param {function}     props.onTeamsChange     - (newTeams) => void — called after successful save.
 * @param {function|null} [props.onTeamCreated]  - Called after a new team is created.
 * @return {JSX.Element}
 *
 * Logic: Owns all form state (name, new players, removed players, seat swaps) and all
 * touch-drag state for iOS seat-swap drag & drop. Attaches document-level touch event
 * listeners while open (non-passive touchmove to suppress page scroll during drags).
 * Calls the relevant API endpoints on submit, then notifies the parent via onTeamsChange.
 */
export default function AddEditTeamModal({
    isOpen,
    onClose,
    selectedGame,
    editingTeam: editingTeamProp,
    creatingSlot,
    allTeams,
    existingTeams,
    users,
    onTeamsChange,
    onTeamCreated,
}) {
    const [editingTeam, setEditingTeam] = useState(null);
    const [teamForm, setTeamForm] = useState(defaultTeamForm);
    const [playerInput, setPlayerInput] = useState(defaultPlayerInput);
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [removedExistingPlayerIds, setRemovedExistingPlayerIds] = useState([]);
    const [pendingSeatSwaps, setPendingSeatSwaps] = useState([]);
    const [draggedPlayerId, setDraggedPlayerId] = useState(null);
    const [dragOverPlayerId, setDragOverPlayerId] = useState(null);
    const [touchingPlayerId, setTouchingPlayerId] = useState(null);
    const [touchGhostPos, setTouchGhostPos] = useState(null);
    const [touchGhostWidth, setTouchGhostWidth] = useState(null);

    const duplicatePlayerErrorTimer = useRef(null);
    const touchDragRef = useRef({ playerId: null, active: false });
    const seatSwapCallbackRef = useRef(null);

    // Re-initialise all form state whenever the modal transitions to open.
    useEffect(() => {
        if (!isOpen) return;

        setEditingTeam(
            editingTeamProp
                ? { id: editingTeamProp.id, name: editingTeamProp.name, existingPlayers: editingTeamProp.players }
                : null,
        );
        setTeamForm(editingTeamProp ? { name: editingTeamProp.name, players: [] } : defaultTeamForm);
        setPlayerInput(defaultPlayerInput);
        setErrors({});
        setRemovedExistingPlayerIds([]);
        setPendingSeatSwaps([]);
        setDraggedPlayerId(null);
        setDragOverPlayerId(null);
        setTouchingPlayerId(null);
        setTouchGhostPos(null);
        setTouchGhostWidth(null);
        touchDragRef.current = { playerId: null, active: false };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reset only when isOpen transitions to true; editingTeamProp is read once per open
    }, [isOpen]);

    // Clean up the duplicate-name error debounce timer on unmount.
    useEffect(() => () => clearTimeout(duplicatePlayerErrorTimer.current), []);

    // Attach document-level touch handlers for iOS seat-swap drag & drop.
    // The HTML5 drag API is not supported on iOS Safari, so we replicate it by
    // tracking touch co-ordinates manually on the document. The touchmove listener
    // is non-passive so it can call preventDefault() to suppress page scroll while
    // a drag is in progress.
    useEffect(() => {
        if (!isOpen) return undefined;

        const onTouchStart = (e) => {
            const li = e.target?.closest('[data-player-id]');
            if (!li) return;
            const pid = Number(li.dataset.playerId);
            touchDragRef.current = { playerId: pid, active: true };
            setTouchingPlayerId(pid);
            setTouchGhostPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
            setTouchGhostWidth(li.getBoundingClientRect().width);
        };

        const onTouchMove = (e) => {
            if (!touchDragRef.current.active) return;
            e.preventDefault();
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const li = target?.closest('[data-player-id]');
            const overId = li ? Number(li.dataset.playerId) : null;
            setDragOverPlayerId(
                overId !== null && overId !== touchDragRef.current.playerId ? overId : null,
            );
            setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
        };

        const onTouchEnd = (e) => {
            if (!touchDragRef.current.active) return;
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const li = target?.closest('[data-player-id]');
            const targetId = li ? Number(li.dataset.playerId) : null;
            if (targetId !== null && targetId !== touchDragRef.current.playerId) {
                seatSwapCallbackRef.current?.(touchDragRef.current.playerId, targetId);
            }
            touchDragRef.current = { playerId: null, active: false };
            setDragOverPlayerId(null);
            setTouchingPlayerId(null);
            setTouchGhostPos(null);
            setTouchGhostWidth(null);
        };

        const onTouchCancel = () => {
            touchDragRef.current = { playerId: null, active: false };
            setDragOverPlayerId(null);
            setTouchingPlayerId(null);
            setTouchGhostPos(null);
            setTouchGhostWidth(null);
        };

        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchCancel);

        return () => {
            document.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            document.removeEventListener('touchcancel', onTouchCancel);
        };
    }, [isOpen]);

    /**
     * Populates the player name field when a registered user is selected from the dropdown.
     *
     * @param {string} userId - Selected option value (empty string to clear).
     * @return {void}
     *
     * Logic: Looks up the user by ID and copies their name into playerInput so the
     * form field is pre-filled; clears the input when the placeholder option is picked.
     */
    const handleUserSelect = (userId) => {
        if (userId === '') {
            setPlayerInput(defaultPlayerInput);
            return;
        }
        const user = users.find((u) => String(u.id) === userId);
        setPlayerInput({ userId, name: user?.name ?? '' });
    };

    /**
     * Validates and appends a new player to the pending-players list.
     *
     * @return {void}
     *
     * Logic: Normalises the player name, rejects blanks and duplicates (checking both
     * existing and new players). On success, appends to teamForm.players and resets the
     * player input. Duplicate errors auto-dismiss after 3 seconds.
     */
    const handleAddPlayer = () => {
        const name = normalizeName(playerInput.name);

        if (name === '') {
            setErrors((current) => ({ ...current, playerName: 'Player name is required.' }));
            return;
        }

        const allCurrentPlayers = [
            ...(editingTeam?.existingPlayers ?? []).filter((p) => !removedExistingPlayerIds.includes(p.id)),
            ...teamForm.players,
        ];

        const duplicate = allCurrentPlayers.some(
            (p) => normalizeName(p.display_name ?? p.name ?? '').toLowerCase() === name.toLowerCase(),
        );

        if (duplicate) {
            clearTimeout(duplicatePlayerErrorTimer.current);
            setErrors((current) => ({ ...current, playerName: 'A player with this name already exists in this team.' }));
            duplicatePlayerErrorTimer.current = setTimeout(
                () => setErrors((current) => ({ ...current, playerName: undefined })),
                3000,
            );
            return;
        }

        setErrors((current) => ({ ...current, playerName: undefined }));
        setTeamForm((current) => ({
            ...current,
            players: [...current.players, { userId: playerInput.userId || null, name }],
        }));
        setPlayerInput(defaultPlayerInput);
    };

    /**
     * Removes a newly-added (not-yet-saved) player by index.
     *
     * @param {number} index - Index in teamForm.players.
     * @return {void}
     *
     * Logic: Filters the players array, excluding the entry at the given index.
     */
    const removePlayer = (index) => {
        setTeamForm((current) => ({
            ...current,
            players: current.players.filter((_, i) => i !== index),
        }));
    };

    /**
     * Queue a seat swap between two existing players in the edit modal.
     *
     * @param {number} playerIdA - ID of the first player.
     * @param {number} playerIdB - ID of the second (drop-target) player.
     * @return {void}
     *
     * Logic: Flips the seat_number of the two players in editingTeam.existingPlayers
     * for immediate visual feedback, and appends the pair to pendingSeatSwaps so
     * handleSubmit can replay them via the API when the user confirms the edit.
     */
    const handleSeatSwap = useCallback((playerIdA, playerIdB) => {
        setEditingTeam((prev) => {
            if (!prev) return prev;
            const playerA = prev.existingPlayers.find((p) => p.id === playerIdA);
            const playerB = prev.existingPlayers.find((p) => p.id === playerIdB);
            if (playerA?.seat_number == null || playerB?.seat_number == null) return prev;
            const seatA = playerA.seat_number;
            const seatB = playerB.seat_number;
            return {
                ...prev,
                existingPlayers: prev.existingPlayers.map((p) => {
                    if (p.id === playerIdA) return { ...p, seat_number: seatB };
                    if (p.id === playerIdB) return { ...p, seat_number: seatA };
                    return p;
                }),
            };
        });
        setPendingSeatSwaps((prev) => [...prev, { playerIdA, playerIdB }]);
    }, []);

    // Keep the ref current so the document-level touchend handler (registered once
    // per isOpen change) can call the latest closure without a stale reference.
    seatSwapCallbackRef.current = handleSeatSwap;

    /**
     * Persists the create or edit operation via the API.
     *
     * @param {React.FormEvent} event
     * @return {Promise<void>}
     *
     * Logic: Validates name (required, globally unique). For edits: renames, removes
     * marked players, adds new players, and replays queued seat swaps sequentially.
     * For creates: creates the team, then adds new players. Calls onTeamsChange with
     * the updated team list from the last response on success, then closes the modal.
     */
    const handleSubmit = async (event) => {
        event.preventDefault();
        setErrors({});

        const name = normalizeName(teamForm.name);

        if (name === '') {
            setErrors({ teamName: 'A team name is required.' });
            return;
        }

        const globalDuplicate = [...allTeams, ...existingTeams].some(
            (t) => normalizeName(t.name).toLowerCase() === name.toLowerCase() && t.id !== editingTeam?.id,
        );

        if (globalDuplicate) {
            setErrors({ teamName: 'A team with this name already exists.' });
            return;
        }

        setIsSaving(true);

        try {
            if (editingTeam) {
                let lastResponse = await api.put(
                    `/games/${selectedGame.id}/teams/${editingTeam.id}`,
                    { name },
                );

                for (const playerId of removedExistingPlayerIds) {
                    lastResponse = await api.delete(
                        `/games/${selectedGame.id}/teams/${editingTeam.id}/players/${playerId}`,
                    );
                }

                for (const player of teamForm.players) {
                    const payload = player.userId
                        ? { user_id: Number(player.userId), name: player.name }
                        : { name: player.name };
                    lastResponse = await api.post(
                        `/games/${selectedGame.id}/teams/${editingTeam.id}/players`,
                        payload,
                    );
                }

                for (const { playerIdA, playerIdB } of pendingSeatSwaps) {
                    lastResponse = await api.put(
                        `/games/${selectedGame.id}/players/swap-seats`,
                        { player_id_a: playerIdA, player_id_b: playerIdB },
                    );
                }

                const newTeams = lastResponse.data?.data?.game?.teams ?? [];
                startTransition(() => {
                    onTeamsChange?.(newTeams);
                });
            } else {
                const teamResponse = await api.post(
                    `/games/${selectedGame.id}/teams`,
                    { name },
                );

                const summaryTeams = teamResponse.data?.data?.game?.teams ?? [];
                const createdTeam =
                    summaryTeams.find((t) => t.name === name) ??
                    summaryTeams[summaryTeams.length - 1];

                if (!createdTeam) {
                    throw new Error('Created team not found in response.');
                }

                let lastResponse = teamResponse;

                for (const player of teamForm.players) {
                    const payload = player.userId
                        ? { user_id: Number(player.userId), name: player.name }
                        : { name: player.name };
                    lastResponse = await api.post(
                        `/games/${selectedGame.id}/teams/${createdTeam.id}/players`,
                        payload,
                    );
                }

                const newTeams = lastResponse.data?.data?.game?.teams ?? summaryTeams;
                startTransition(() => {
                    onTeamsChange?.(newTeams);
                });
                onTeamCreated?.();
            }

            onClose();
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};
            const firstApiError = Object.values(apiErrors).flat()[0];
            setErrors({
                teamName: apiErrors.name?.[0],
                general: firstApiError || 'Unable to save the team right now.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (isSaving) return;
        onClose();
    };

    const ghostPlayer = editingTeam?.existingPlayers?.find((p) => p.id === touchingPlayerId);

    return (
        <>
            <Modal maxWidth="lg" onClose={handleClose} show={isOpen}>
                <form className="space-y-6 p-6" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-slate-900">
                            {editingTeam ? 'Edit team' : 'Create a team'}
                        </h4>
                        <p className="text-sm text-slate-600">
                            {editingTeam
                                ? 'Update the team name or add more players.'
                                : 'Enter a team name and add the players who will compete.'}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <InputLabel htmlFor="team-name" value="Team name" />
                        <TextInput
                            className="block w-full rounded-xl"
                            id="team-name"
                            isFocused
                            onChange={(event) =>
                                setTeamForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                            placeholder="Team Alpha"
                            value={teamForm.name}
                        />
                        <InputError message={errors.teamName} />
                    </div>

                    {editingTeam && editingTeam.existingPlayers.filter((p) => !removedExistingPlayerIds.includes(p.id)).length > 0 ? (
                        <SeatedPlayerList
                            players={editingTeam.existingPlayers}
                            removedIds={removedExistingPlayerIds}
                            draggedPlayerId={draggedPlayerId}
                            dragOverPlayerId={dragOverPlayerId}
                            touchingPlayerId={touchingPlayerId}
                            onDragStart={setDraggedPlayerId}
                            onDragEnd={() => {
                                setDraggedPlayerId(null);
                                setDragOverPlayerId(null);
                            }}
                            onDragOver={setDragOverPlayerId}
                            onDragLeave={() => setDragOverPlayerId(null)}
                            onDrop={(draggedId, targetId) => {
                                handleSeatSwap(draggedId, targetId);
                                setDraggedPlayerId(null);
                                setDragOverPlayerId(null);
                            }}
                            onRemove={(playerId) =>
                                setRemovedExistingPlayerIds((ids) => [...ids, playerId])
                            }
                        />
                    ) : null}

                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            {editingTeam ? 'Add more players' : 'Add players'}
                        </p>

                        <div className="space-y-2">
                            <InputLabel htmlFor="player-user" value="Registered user (optional)" />
                            <select
                                id="player-user"
                                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                onChange={(event) => handleUserSelect(event.target.value)}
                                value={playerInput.userId}
                            >
                                <option value="">— No registered user —</option>
                                {users.map((user) => (
                                    <option key={user.id} value={String(user.id)}>
                                        {user.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <InputLabel htmlFor="player-name" value="Player name" />
                            <div className="flex gap-2">
                                <TextInput
                                    className="block flex-1 rounded-xl"
                                    id="player-name"
                                    onChange={(event) =>
                                        setPlayerInput((current) => ({
                                            ...current,
                                            name: event.target.value,
                                        }))
                                    }
                                    placeholder="Enter player name"
                                    value={playerInput.name}
                                />
                                <SecondaryButton
                                    className="rounded-xl"
                                    onClick={handleAddPlayer}
                                    type="button"
                                >
                                    Add player
                                </SecondaryButton>
                            </div>
                            <InputError message={errors.playerName} />
                        </div>

                        {teamForm.players.length > 0 ? (
                            <ul className="space-y-1 pt-1">
                                {teamForm.players.map((player, index) => {
                                    const modalSlot = editingTeam
                                        ? (existingTeams ?? []).findIndex((t) => t.id === editingTeam.id)
                                        : creatingSlot;
                                    const nonRemovedExistingCount = editingTeam
                                        ? editingTeam.existingPlayers.filter(
                                            (p) => !removedExistingPlayerIds.includes(p.id),
                                        ).length
                                        : 0;
                                    const projectedSeat =
                                        modalSlot === 0 || modalSlot === 1
                                            ? (nonRemovedExistingCount + index) * 2 + (modalSlot === 0 ? 1 : 2)
                                            : null;

                                    return (
                                        <li
                                            key={index}
                                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                {projectedSeat != null ? (
                                                    <span
                                                        aria-label={`Seat ${projectedSeat}`}
                                                        className="flex flex-shrink-0 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500"
                                                    >
                                                        Seat {projectedSeat}
                                                    </span>
                                                ) : null}
                                                <span className="truncate">{player.name}</span>
                                            </div>
                                            <button
                                                aria-label={`Remove ${player.name}`}
                                                className="ml-2 text-slate-400 hover:text-red-500"
                                                onClick={() => removePlayer(index)}
                                                type="button"
                                            >
                                                ×
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : null}
                    </div>

                    <InputError message={errors.general} />

                    <div className="flex justify-end gap-3">
                        <SecondaryButton disabled={isSaving} onClick={handleClose} type="button">
                            Cancel
                        </SecondaryButton>
                        <PrimaryButton disabled={isSaving} type="submit">
                            {editingTeam ? 'Update team' : 'Create team'}
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>

            {touchingPlayerId && touchGhostPos && ghostPlayer && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none fixed left-0 top-0 z-[200]"
                    style={{ transform: `translate(calc(${touchGhostPos.x}px - 50%), calc(${touchGhostPos.y}px - 100% - 8px)) scale(1.1)` }}
                >
                    <div
                        className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-2xl ring-2 ring-inset ring-indigo-400 opacity-90"
                        style={touchGhostWidth ? { width: touchGhostWidth } : undefined}
                    >
                        {ghostPlayer.seat_number != null && (
                            <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                Seat {ghostPlayer.seat_number}
                            </span>
                        )}
                        <span>{ghostPlayer.display_name}</span>
                    </div>
                </div>
            )}
        </>
    );
}
