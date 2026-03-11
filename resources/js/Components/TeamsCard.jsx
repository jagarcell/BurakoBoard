import axios from 'axios';
import { startTransition, useEffect, useRef, useState } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TeamActionButton from '@/Components/TeamActionButton';
import TeamSlotSelector from '@/Components/TeamSlotSelector';
import TextInput from '@/Components/TextInput';

const defaultTeamForm = { name: '', players: [] };
const defaultPlayerInput = { userId: '', name: '' };

export default function TeamsCard({ selectedGame, initialTeams = [], scoreUpdate = null, isFetching = false }) {
    const [teams, setTeams] = useState(initialTeams);
    const [users, setUsers] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [slotSelections, setSlotSelections] = useState({ 0: '', 1: '' });
    const [slotAdding, setSlotAdding] = useState({ 0: false, 1: false });
    const [slotAddErrors, setSlotAddErrors] = useState({ 0: '', 1: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [teamForm, setTeamForm] = useState(defaultTeamForm);
    const [playerInput, setPlayerInput] = useState(defaultPlayerInput);
    const [errors, setErrors] = useState({});
    const [editingTeam, setEditingTeam] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const duplicatePlayerErrorTimer = useRef(null);

    // Sync teams whenever the parent's initialTeams reference changes (data loaded or game changed)
    useEffect(() => {
        startTransition(() => setTeams(initialTeams));
    }, [initialTeams]);

    useEffect(() => {
        let isActive = true;

        axios.get('/api/v1/users').then((response) => {
            if (isActive) setUsers(response.data?.data?.users ?? []);
        });

        axios.get('/api/v1/teams').then((response) => {
            if (isActive) setAllTeams(response.data?.data?.teams ?? []);
        });

        return () => { isActive = false; };
    }, []);

    useEffect(() => {
        if (! scoreUpdate?.length) return;

        startTransition(() =>
            setTeams((prev) =>
                prev.map((t) => {
                    const updated = scoreUpdate.find((u) => u.id === t.id);

                    return updated ? { ...t, current_score: updated.current_score } : t;
                }),
            ),
        );
    }, [scoreUpdate]);

    const resetModal = () => {
        clearTimeout(duplicatePlayerErrorTimer.current);
        setTeamForm(defaultTeamForm);
        setPlayerInput(defaultPlayerInput);
        setErrors({});
        setEditingTeam(null);
    };

    const openModal = () => {
        resetModal();
        setIsModalOpen(true);
    };

    const openEditModal = (team) => {
        setEditingTeam({ id: team.id, name: team.name, existingPlayers: team.players });
        setTeamForm({ name: team.name, players: [] });
        setPlayerInput(defaultPlayerInput);
        setErrors({});
        setIsModalOpen(true);
    };

    const closeModal = () => {
        if (isSaving) {
            return;
        }

        setIsModalOpen(false);
        resetModal();
    };

    const handleUserSelect = (userId) => {
        if (userId === '') {
            setPlayerInput(defaultPlayerInput);

            return;
        }

        const user = users.find((u) => String(u.id) === userId);

        setPlayerInput({ userId, name: user?.name ?? '' });
    };

    const handleAddPlayer = () => {
        const name = normalizeName(playerInput.name);

        if (name === '') {
            setErrors((current) => ({ ...current, playerName: 'Player name is required.' }));

            return;
        }

        const allCurrentPlayers = [
            ...(editingTeam?.existingPlayers ?? []),
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
            players: [
                ...current.players,
                { userId: playerInput.userId || null, name },
            ],
        }));

        setPlayerInput(defaultPlayerInput);
    };

    const removePlayer = (index) => {
        setTeamForm((current) => ({
            ...current,
            players: current.players.filter((_, i) => i !== index),
        }));
    };

    const handleAddExistingTeam = async (slot) => {
        const selectedTeamId = Number(slotSelections[slot]);
        const selectedTeam = allTeams.find((t) => t.id === selectedTeamId);

        if (! selectedTeam) return;

        const duplicate = teams.some(
            (t) => normalizeName(t.name).toLowerCase() === normalizeName(selectedTeam.name).toLowerCase(),
        );

        if (duplicate) {
            setSlotAddErrors((s) => ({
                ...s,
                [slot]: 'A team with this name already exists in this game.',
            }));

            return;
        }

        setSlotAdding((s) => ({ ...s, [slot]: true }));
        setSlotAddErrors((s) => ({ ...s, [slot]: '' }));

        try {
            const teamResponse = await axios.post(
                `/api/v1/games/${selectedGame.id}/teams`,
                { name: selectedTeam.name },
            );

            const summaryTeams = teamResponse.data?.data?.game?.teams ?? [];
            const createdTeam =
                summaryTeams.find((t) => t.name === selectedTeam.name) ??
                summaryTeams[summaryTeams.length - 1];

            if (! createdTeam) throw new Error('Created team not found in response.');

            let lastResponse = teamResponse;

            for (const player of selectedTeam.players) {
                const payload = player.user_id
                    ? { user_id: player.user_id, name: player.display_name }
                    : { name: player.display_name };

                lastResponse = await axios.post(
                    `/api/v1/games/${selectedGame.id}/teams/${createdTeam.id}/players`,
                    payload,
                );
            }

            startTransition(() => {
                setTeams(lastResponse.data?.data?.game?.teams ?? summaryTeams);
            });

            setSlotSelections((s) => ({ ...s, [slot]: '' }));
        } catch {
            setSlotAddErrors((s) => ({
                ...s,
                [slot]: 'Unable to add the team right now.',
            }));
        } finally {
            setSlotAdding((s) => ({ ...s, [slot]: false }));
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setErrors({});

        const name = normalizeName(teamForm.name);

        if (name === '') {
            setErrors({ teamName: 'A team name is required.' });

            return;
        }

        const duplicate = teams.some(
            (t) => normalizeName(t.name).toLowerCase() === name.toLowerCase() && t.id !== editingTeam?.id,
        );

        if (duplicate) {
            setErrors({ teamName: 'A team with this name already exists in this game.' });

            return;
        }

        setIsSaving(true);

        try {
            if (editingTeam) {
                let lastResponse = await axios.put(
                    `/api/v1/games/${selectedGame.id}/teams/${editingTeam.id}`,
                    { name },
                );

                for (const player of teamForm.players) {
                    const payload = player.userId
                        ? { user_id: Number(player.userId), name: player.name }
                        : { name: player.name };

                    lastResponse = await axios.post(
                        `/api/v1/games/${selectedGame.id}/teams/${editingTeam.id}/players`,
                        payload,
                    );
                }

                startTransition(() => {
                    setTeams(lastResponse.data?.data?.game?.teams ?? []);
                });
            } else {
                const teamResponse = await axios.post(
                    `/api/v1/games/${selectedGame.id}/teams`,
                    { name },
                );

                const summaryTeams = teamResponse.data?.data?.game?.teams ?? [];
                const createdTeam =
                    summaryTeams.find((t) => t.name === name) ??
                    summaryTeams[summaryTeams.length - 1];

                if (! createdTeam) {
                    throw new Error('Created team not found in response.');
                }

                let lastResponse = teamResponse;

                for (const player of teamForm.players) {
                    const payload = player.userId
                        ? { user_id: Number(player.userId), name: player.name }
                        : { name: player.name };

                    lastResponse = await axios.post(
                        `/api/v1/games/${selectedGame.id}/teams/${createdTeam.id}/players`,
                        payload,
                    );
                }

                startTransition(() => {
                    setTeams(
                        lastResponse.data?.data?.game?.teams ?? summaryTeams,
                    );
                });
            }

            setIsModalOpen(false);
            resetModal();
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

    const teamSlots = [0, 1];

    /** Trim and collapse inner whitespace so '  Team  Alpha  ' → 'Team Alpha'. */
    const normalizeName = (str) => str.trim().replace(/\s+/g, ' ');

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

                <div className="divide-y divide-slate-100">
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

                            return (
                                <div key={slot} className="px-6 py-5">
                                    {team ? (
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                        Team {slot + 1}
                                                    </p>
                                                    <span
                                                        aria-label={`${team.name} score`}
                                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                            team.current_score > 0
                                                                ? 'bg-green-100 text-green-800'
                                                                : team.current_score < 0
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-[bisque] text-green-700'
                                                        }`}
                                                    >
                                                        {team.current_score}
                                                    </span>
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
                                                                className="text-sm text-slate-600"
                                                            >
                                                                {player.display_name}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : ! isCollapsed ? (
                                                    <p className="mt-2 text-sm italic text-slate-400">
                                                        No players yet.
                                                    </p>
                                                ) : null}
                                            </div>
                                            <TeamActionButton
                                                onClick={() => openEditModal(team)}
                                                type="button"
                                            >
                                                Edit team
                                            </TeamActionButton>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Team {slot + 1}
                                            </p>
                                            <TeamSlotSelector
                                        allTeams={allTeams}
                                        disabled={slotAdding[slot]}
                                        excludedTeamIds={teams.map((t) => t.id)}
                                        onAddTeam={() => handleAddExistingTeam(slot)}
                                        onCreateTeam={openModal}
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
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            <Modal maxWidth="lg" onClose={closeModal} show={isModalOpen}>
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

                    {editingTeam && editingTeam.existingPlayers.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                                Current players
                            </p>
                            <ul className="space-y-1">
                                {editingTeam.existingPlayers.map((player) => (
                                    <li
                                        key={player.id}
                                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                    >
                                        {player.display_name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            {editingTeam ? 'Add more players' : 'Add players'}
                        </p>

                        <div className="space-y-2">
                            <InputLabel
                                htmlFor="player-user"
                                value="Registered user (optional)"
                            />
                            <select
                                id="player-user"
                                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                onChange={(event) =>
                                    handleUserSelect(event.target.value)
                                }
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
                                {teamForm.players.map((player, index) => (
                                    <li
                                        key={index}
                                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                    >
                                        <span>{player.name}</span>
                                        <button
                                            aria-label={`Remove ${player.name}`}
                                            className="ml-2 text-slate-400 hover:text-red-500"
                                            onClick={() => removePlayer(index)}
                                            type="button"
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    <InputError message={errors.general} />

                    <div className="flex justify-end gap-3">
                        <SecondaryButton
                            disabled={isSaving}
                            onClick={closeModal}
                            type="button"
                        >
                            Cancel
                        </SecondaryButton>

                        <PrimaryButton disabled={isSaving} type="submit">
                            {editingTeam ? 'Update team' : 'Create team'}
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
        </>
    );
}
