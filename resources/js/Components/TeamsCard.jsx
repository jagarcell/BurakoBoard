import api from '@/api/client';
import { Fragment, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AddEditTeamModal from '@/Components/AddEditTeamModal';
import RandomTeamsModal from '@/Components/RandomTeamsModal';
import TeamActionButton from '@/Components/TeamActionButton';
import TeamScoreBadge from '@/Components/TeamScoreBadge';
import TeamSlotSelector from '@/Components/TeamSlotSelector';

export default function TeamsCard({ selectedGame, initialTeams = [], gameSummary = null, scoreUpdate = null, isFetching = false, onTeamsChange, onTeamCreated, onWinnerBadgeClick = null }) {
    const [teams, setTeams] = useState(initialTeams);
    const [users, setUsers] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [slotSelections, setSlotSelections] = useState({ 0: '', 1: '' });
    const [slotAdding, setSlotAdding] = useState({ 0: false, 1: false });
    const [slotAddErrors, setSlotAddErrors] = useState({ 0: '', 1: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTeam, setEditingTeam] = useState(null);
    const [creatingSlot, setCreatingSlot] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isRandomModalOpen, setIsRandomModalOpen] = useState(false);
    const [randomPlayerNames, setRandomPlayerNames] = useState(Array(6).fill(''));
    const [randomTeamsError, setRandomTeamsError] = useState('');
    const [randomDuplicateIndexes, setRandomDuplicateIndexes] = useState([]);
    const [isCreatingRandomTeams, setIsCreatingRandomTeams] = useState(false);
    const diffLabelRef = useRef(null);
    const [arrowHalfWidth, setArrowHalfWidth] = useState(null);

    // Sync teams whenever the parent's initialTeams reference changes (data loaded or game changed)
    useEffect(() => {
        setTeams(initialTeams);
    }, [initialTeams]);

    const fetchAllTeams = useCallback(() => {
        api.get('/teams').then((response) => {
            setAllTeams(response.data?.data?.teams ?? []);
        });
    }, []);

    /**
     * Re-fetches the users and all-teams catalogs used in the create/edit modal.
     * Called imperatively when any modal is opened so the dropdown options
     * reflect data that may have been added by another session since mount.
     *
     * @return {void}
     * Logic: Issues two parallel GET requests for /users and /teams, then
     *        updates the corresponding state slices when each resolves.
     */
    const fetchCatalog = useCallback(() => {
        api.get('/users').then((response) => {
            setUsers(response.data?.data?.users ?? []);
        });
        api.get('/teams').then((response) => {
            setAllTeams(response.data?.data?.teams ?? []);
        });
    }, []);

    useEffect(() => {
        let isActive = true;

        api.get('/users').then((response) => {
            if (isActive) setUsers(response.data?.data?.users ?? []);
        });

        api.get('/teams').then((response) => {
            if (isActive) setAllTeams(response.data?.data?.teams ?? []);
        });

        return () => { isActive = false; };
    }, [fetchAllTeams]);

    useEffect(() => {
        if (! scoreUpdate?.length) return;

        setTeams((prev) =>
            prev.map((t) => {
                const updated = scoreUpdate.find((u) => u.id === t.id);

                return updated ? { ...t, current_score: updated.current_score } : t;
            }),
        );
    }, [scoreUpdate]);

    // Measure the "Difference" label width when both teams become available so the
    // arrowhead clip-path can be sized exactly to the label text + 1rem each side.
    useLayoutEffect(() => {
        if (diffLabelRef.current) {
            const w = diffLabelRef.current.getBoundingClientRect().width;
            setArrowHalfWidth(Math.round(w / 2) + 16);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diffLabelRef is a stable ref; no reactive deps beyond the teams.length === 2 boolean trigger
    }, [teams.length === 2]);

    const resetModal = () => {
        setEditingTeam(null);
        setCreatingSlot(null);
    };

    const openModal = (slot = null) => {
        resetModal();
        setCreatingSlot(slot);
        fetchCatalog();
        setIsModalOpen(true);
    };

    const openEditModal = (team) => {
        setEditingTeam(team);
        fetchCatalog();
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetModal();
    };

    const openRandomTeamsModal = () => {
        setRandomTeamsError('');
        setRandomDuplicateIndexes([]);
        setRandomPlayerNames(Array(6).fill(''));
        setIsRandomModalOpen(true);
    };

    const closeRandomTeamsModal = () => {
        if (isCreatingRandomTeams) return;
        setIsRandomModalOpen(false);
        setRandomTeamsError('');
        setRandomDuplicateIndexes([]);
    };

    const handleRandomPlayerNameChange = (index, value) => {
        setRandomTeamsError('');
        setRandomDuplicateIndexes((prev) => prev.filter((slot) => slot !== index));

        setRandomPlayerNames((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const handleCreateRandomTeams = async () => {
        setRandomTeamsError('');
        setRandomDuplicateIndexes([]);

        const normalizedNames = randomPlayerNames
            .map((name, index) => ({
                index,
                value: name.trim().replace(/\s+/g, ' ').toLowerCase(),
            }))
            .filter((entry) => entry.value.length > 0);

        const duplicateCounts = normalizedNames.reduce((acc, entry) => {
            acc.set(entry.value, (acc.get(entry.value) ?? 0) + 1);
            return acc;
        }, new Map());

        const duplicateValues = new Set(
            [...duplicateCounts.entries()]
                .filter(([, count]) => count > 1)
                .map(([value]) => value),
        );

        const duplicateIndexes = normalizedNames
            .filter((entry) => duplicateValues.has(entry.value))
            .map((entry) => entry.index);

        if (duplicateIndexes.length > 0) {
            setRandomDuplicateIndexes(duplicateIndexes);
            setRandomTeamsError('Duplicate player names are not allowed. Please use unique names.');
            return;
        }

        setIsCreatingRandomTeams(true);

        try {
            const response = await api.post(
                `/games/${selectedGame.id}/teams/random`,
                { players: randomPlayerNames },
            );

            const newTeams = response.data?.data?.game?.teams ?? [];

            startTransition(() => {
                setTeams(newTeams);
            });
            onTeamsChange?.(newTeams);
            onTeamCreated?.();
            setIsRandomModalOpen(false);
            setRandomPlayerNames(Array(6).fill(''));
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};
            const firstApiError = Object.values(apiErrors).flat()[0];
            setRandomTeamsError(firstApiError || 'Unable to create random teams right now.');
        } finally {
            setIsCreatingRandomTeams(false);
        }
    };

    const handleAddExistingTeam = async (slot) => {
        const selectedTeamId = Number(slotSelections[slot]);
        const selectedTeam = allTeams.find((t) => t.id === selectedTeamId);

        if (! selectedTeam) return;

        setSlotAdding((s) => ({ ...s, [slot]: true }));
        setSlotAddErrors((s) => ({ ...s, [slot]: '' }));

        try {
            const response = await api.post(
                `/games/${selectedGame.id}/teams/${selectedTeam.id}/attach`,
            );

            const newTeams = response.data?.data?.game?.teams ?? [];
            startTransition(() => {
                setTeams(newTeams);
            });
            onTeamsChange?.(newTeams);
            onTeamCreated?.();

            setSlotSelections((s) => ({ ...s, [slot]: '' }));
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};
            const firstApiError = Object.values(apiErrors).flat()[0];
            setSlotAddErrors((s) => ({
                ...s,
                [slot]: firstApiError || 'Unable to add the team right now.',
            }));
        } finally {
            setSlotAdding((s) => ({ ...s, [slot]: false }));
        }
    };

    const teamSlots = [0, 1];
    const isGameEditable = selectedGame?.status === 'in_progress' && selectedGame?.user_role !== 'viewer';
    const isCreator = selectedGame?.user_role === 'creator';
    const winnerTeamId =
        selectedGame?.status === 'finished' && teams.length === 2 && teams[0].current_score !== teams[1].current_score
            ? (teams[0].current_score > teams[1].current_score ? teams[0].id : teams[1].id)
            : null;

    const bothPositive = teams.length === 2 && teams[0].current_score > 0 && teams[1].current_score > 0;

    const playerCountMismatch =
        teams.length === 2 && teams[0].players.length !== teams[1].players.length;

    const roundRoles = gameSummary?.round_roles ?? [];
    const lastCompletedRoundNumber = Number(gameSummary?.game?.current_round_number ?? selectedGame?.current_round_number ?? 0);
    const activeRoundNumber = selectedGame?.status === 'in_progress'
        ? lastCompletedRoundNumber + 1
        : lastCompletedRoundNumber;
    const currentRoundRoles = roundRoles.find(
        (roundRole) => Number(roundRole.round_number) === activeRoundNumber,
    ) ?? null;

    /**
     * Returns the role label for the given player in the active round.
     *
     * @param {number} playerId - The player's ID.
     * @return {string|null} Role label string, or null if the player has no role.
     *
     * Logic: Checks each role key of the current round's role object in priority order and
     * returns the matching human-readable label, or null when no match is found.
     */
    const getCurrentRoundRoleForPlayer = (playerId) => {
        if (! currentRoundRoles || activeRoundNumber <= 0) {
            return null;
        }

        if (currentRoundRoles.cutter?.player_id === playerId) {
            return 'Cutter';
        }

        if (currentRoundRoles.dealer?.player_id === playerId) {
            return 'Dealer';
        }

        if (currentRoundRoles.first_draw?.player_id === playerId) {
            return 'First Draw';
        }

        return null;
    };

    const triangleWidth = arrowHalfWidth !== null ? `${arrowHalfWidth * 2}px` : null;

    return (
        <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="max-w-2xl space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                                Teams
                            </p>
                            {teams.length < 2 ? (
                                <>
                                    <h3 className="text-2xl font-semibold text-slate-900">
                                        Build the two teams for this game.
                                    </h3>
                                    <p className="text-sm text-slate-600">
                                        Each game requires exactly two teams. Add registered
                                        players or enter a custom name for each participant.
                                    </p>
                                    {isCreator && isGameEditable && teams.length === 0 ? (
                                        <div className="pt-2">
                                            <button
                                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-100"
                                                onClick={openRandomTeamsModal}
                                                type="button"
                                            >
                                                Create random teams (optional)
                                            </button>
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                        </div>
                        {teams.length === 2 ? (
                            <button
                                aria-label={isCollapsed ? 'Expand teams section' : 'Collapse teams section'}
                                className="mt-0.5 flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                onClick={() => setIsCollapsed((c) => ! c)}
                                type="button"
                            >
                                <svg
                                    aria-hidden="true"
                                    className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        ) : null}
                    </div>
                </div>

                <div>
                    {! selectedGame ? (
                        <p className="px-6 py-5 text-sm text-slate-400">
                            Select a game above to manage its teams.
                        </p>
                    ) : isFetching && ! teams.length ? (
                        <p className="px-6 py-5 text-sm text-slate-400">
                            Loading teams…
                        </p>
                    ) : (
                        teamSlots.map((slot) => {
                            const team = teams[slot];
                            const scoreDiff = teams.length === 2
                                ? Math.abs(teams[0].current_score - teams[1].current_score)
                                : null;

                            const arrowDir = teams.length === 2
                                ? (teams[0].current_score > teams[1].current_score ? 'up'
                                    : teams[1].current_score > teams[0].current_score ? 'down'
                                    : 'none')
                                : null;

                            return (
                                <Fragment key={slot}>
                                <div className="px-6 py-5">
                                    {team ? (
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                        Team {slot + 1}
                                                    </p>
                                                    <TeamScoreBadge
                                                        bothPositive={bothPositive}
                                                        label={`${team.name} score`}
                                                        opponentScore={teams[1 - slot]?.current_score ?? null}
                                                        score={team.current_score}
                                                    />
                                                    {selectedGame?.status === 'in_progress' && selectedGame?.target_points != null && (() => {
                                                        const rem = Math.max(0, selectedGame.target_points - team.current_score);
                                                        return rem > 0 ? (
                                                            <span
                                                                className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-sky-700"
                                                                title="Points remaining to reach the game goal"
                                                            >
                                                                -{rem}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                                <div className="mt-1">
                                                    <h4 className="text-base font-semibold text-slate-900">
                                                        {team.name}
                                                    </h4>
                                                </div>
                                                {! isCollapsed && team.players.length > 0 ? (
                                                    <ul className="mt-2 space-y-1">
                                                        {team.players.map((player) => (
                                                            <li
                                                                key={player.id}
                                                                className="flex items-center justify-between gap-2 text-sm text-slate-600"
                                                            >
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    {player.seat_number != null ? (
                                                                        <span
                                                                            aria-label={`Seat ${player.seat_number}`}
                                                                            className="flex flex-shrink-0 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"
                                                                        >
                                                                            Seat {player.seat_number}
                                                                        </span>
                                                                    ) : null}
                                                                    <span className="truncate">{player.display_name}</span>
                                                                </div>

                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : ! isCollapsed ? (
                                                    <p className="mt-2 text-sm italic text-slate-400">
                                                        No players yet.
                                                    </p>
                                                ) : null}
                                            </div>
                                            {isGameEditable ? (
                                                <TeamActionButton
                                                    onClick={() => openEditModal(team)}
                                                    type="button"
                                                >
                                                    Edit team
                                                </TeamActionButton>
                                            ) : winnerTeamId === team.id ? (
                                                <button
                                                    aria-label={`${team.name} winner`}
                                                    className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-xs font-bold text-yellow-900 shadow-sm transition-transform active:scale-95"
                                                    onClick={onWinnerBadgeClick ?? undefined}
                                                    type="button"
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        className="h-3.5 w-3.5 fill-yellow-900"
                                                        viewBox="0 0 24 24"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                    >
                                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                                    </svg>
                                                    Winner
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <>
                                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Team {slot + 1}
                                            </p>
                                            {isGameEditable ? (
                                                <>
                                                    <TeamSlotSelector
                                                        allTeams={allTeams}
                                                        disabled={slotAdding[slot]}
                                                        excludedTeamIds={[
                                                            ...teams.map((t) => t.id),
                                                            ...(slotSelections[1 - slot] ? [Number(slotSelections[1 - slot])] : []),
                                                        ]}
                                                        onAddTeam={() => handleAddExistingTeam(slot)}
                                                        onCreateTeam={() => openModal(slot)}
                                                        onSelect={(val) =>
                                                            setSlotSelections((s) => ({
                                                                ...s,
                                                                [slot]: val,
                                                            }))
                                                        }
                                                        selectedTeamId={slotSelections[slot]}
                                                    />
                                                    {slotAddErrors[slot] ? (
                                                        <p className="mt-2 text-sm text-red-600">
                                                            {slotAddErrors[slot]}
                                                        </p>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <p className="text-sm italic text-slate-400">No team assigned.</p>
                                            )}
                                        </>
                                    )}
                                </div>
                                {slot === 0 && scoreDiff !== null && (
                                    <div aria-label="Score difference">
                                        {arrowDir === 'up' && triangleWidth !== null && (
                                            <div className="flex justify-center">
                                                <div
                                                    className="bg-indigo-50"
                                                    style={{
                                                        width: triangleWidth,
                                                        height: '1.5rem',
                                                        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <div className={`px-6 py-3 text-center ${arrowDir !== 'none' ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                                            <p
                                                ref={diffLabelRef}
                                                className={`w-fit mx-auto text-xs font-semibold uppercase tracking-[0.25em] ${
                                                    arrowDir !== 'none' ? 'text-indigo-400' : 'text-slate-400'
                                                }`}
                                            >
                                                Difference
                                            </p>
                                            <p className={`text-lg font-bold ${
                                                arrowDir !== 'none' ? 'text-indigo-700' : 'text-slate-700'
                                            }`}>
                                                {scoreDiff}
                                            </p>
                                        </div>
                                        {arrowDir === 'down' && triangleWidth !== null && (
                                            <div className="flex justify-center">
                                                <div
                                                    className="bg-indigo-50"
                                                    style={{
                                                        width: triangleWidth,
                                                        height: '1.5rem',
                                                        clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                </Fragment>
                            );
                        })
                    )}

                    {playerCountMismatch ? (
                        <div className="mx-6 mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
                            <p className="text-sm font-semibold text-amber-800">
                                Player count mismatch — the game cannot proceed until both teams have the same number of players.
                            </p>
                            <p className="mt-1 text-sm text-amber-700">
                                {teams[0].name} has {teams[0].players.length}{' '}
                                {teams[0].players.length === 1 ? 'player' : 'players'},{' '}
                                {teams[1].name} has {teams[1].players.length}{' '}
                                {teams[1].players.length === 1 ? 'player' : 'players'}.
                            </p>
                        </div>
                    ) : null}


                </div>
            </section>

            <AddEditTeamModal
                allTeams={allTeams}
                creatingSlot={creatingSlot}
                editingTeam={editingTeam}
                existingTeams={teams}
                isOpen={isModalOpen}
                onClose={closeModal}
                onTeamCreated={() => {
                    fetchAllTeams();
                    onTeamCreated?.();
                }}
                onTeamsChange={(newTeams) => {
                    startTransition(() => setTeams(newTeams));
                    onTeamsChange?.(newTeams);
                    fetchAllTeams();
                }}
                selectedGame={selectedGame}
                users={users}
            />

            <RandomTeamsModal
                duplicateIndexes={randomDuplicateIndexes}
                error={randomTeamsError}
                isCreating={isCreatingRandomTeams}
                isOpen={isRandomModalOpen}
                onClose={closeRandomTeamsModal}
                onCreate={handleCreateRandomTeams}
                onPlayerNameChange={handleRandomPlayerNameChange}
                playerNames={randomPlayerNames}
            />
        </>
    );
}
