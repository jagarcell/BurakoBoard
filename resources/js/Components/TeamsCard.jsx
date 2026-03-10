import axios from 'axios';
import { startTransition, useEffect, useState } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

const defaultTeamForm = { name: '', players: [] };
const defaultPlayerInput = { userId: '', name: '' };

export default function TeamsCard({ selectedGame }) {
    const [teams, setTeams] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [users, setUsers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [teamForm, setTeamForm] = useState(defaultTeamForm);
    const [playerInput, setPlayerInput] = useState(defaultPlayerInput);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        let isActive = true;

        axios.get('/api/v1/users').then((response) => {
            if (isActive) {
                setUsers(response.data?.data?.users ?? []);
            }
        });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (! selectedGame) {
            setTeams([]);
            setLoadError('');

            return;
        }

        let isActive = true;

        setIsLoading(true);
        setLoadError('');

        axios
            .get(`/api/v1/games/${selectedGame.id}`)
            .then((response) => {
                if (isActive) {
                    startTransition(() =>
                        setTeams(response.data?.data?.game?.teams ?? []),
                    );
                }
            })
            .catch(() => {
                if (isActive) {
                    setLoadError('Unable to load teams right now.');
                }
            })
            .finally(() => {
                if (isActive) {
                    setIsLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [selectedGame?.id]);

    const resetModal = () => {
        setTeamForm(defaultTeamForm);
        setPlayerInput(defaultPlayerInput);
        setErrors({});
    };

    const openModal = () => {
        resetModal();
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
        const name = playerInput.name.trim();

        if (name === '') {
            setErrors((current) => ({ ...current, playerName: 'Player name is required.' }));

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

    const handleSubmit = async (event) => {
        event.preventDefault();
        setErrors({});

        const name = teamForm.name.trim();

        if (name === '') {
            setErrors({ teamName: 'A team name is required.' });

            return;
        }

        setIsSaving(true);

        try {
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

            setIsModalOpen(false);
            resetModal();
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};

            setErrors({
                teamName: apiErrors.name?.[0],
                general:
                    apiErrors.name?.[0] ||
                    'Unable to create the team right now.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const canAddTeam = selectedGame !== null && teams.length < 2;
    const teamSlots = [0, 1];

    return (
        <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
                <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                                Teams
                            </p>
                            <h3 className="text-2xl font-semibold text-slate-900">
                                Build the two teams for this game.
                            </h3>
                            <p className="text-sm text-slate-600">
                                Each game requires exactly two teams. Add registered
                                players or enter a custom name for each participant.
                            </p>
                        </div>

                        <PrimaryButton
                            className="min-h-12 justify-center rounded-2xl px-6 text-[11px]"
                            disabled={! canAddTeam}
                            onClick={openModal}
                            type="button"
                        >
                            Add team
                        </PrimaryButton>
                    </div>

                    {loadError !== '' ? (
                        <p className="mt-4 text-sm font-medium text-red-600">
                            {loadError}
                        </p>
                    ) : null}
                </div>

                <div className="divide-y divide-slate-100">
                    {! selectedGame ? (
                        <p className="px-6 py-5 text-sm text-slate-400">
                            Select a game above to manage its teams.
                        </p>
                    ) : isLoading ? (
                        <p className="px-6 py-5 text-sm text-slate-400">
                            Loading teams…
                        </p>
                    ) : (
                        teamSlots.map((slot) => {
                            const team = teams[slot];

                            return (
                                <div key={slot} className="px-6 py-5">
                                    {team ? (
                                        <>
                                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Team {slot + 1}
                                            </p>
                                            <h4 className="mt-1 text-base font-semibold text-slate-900">
                                                {team.name}
                                            </h4>
                                            {team.players.length > 0 ? (
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
                                            ) : (
                                                <p className="mt-2 text-sm italic text-slate-400">
                                                    No players yet.
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm italic text-slate-400">
                                            Team {slot + 1} — not added yet.
                                        </p>
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
                            Create a team
                        </h4>
                        <p className="text-sm text-slate-600">
                            Enter a team name and add the players who will compete.
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

                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            Add players
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
                            Create team
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
        </>
    );
}
