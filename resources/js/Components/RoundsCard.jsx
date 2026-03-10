import axios from 'axios';
import { useEffect, useState } from 'react';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';

export default function RoundsCard({ selectedGame, initialTeams = [], initialRounds = [], onRoundRecorded, isFetching = false }) {
    const [teams, setTeams] = useState(initialTeams);
    const [rounds, setRounds] = useState(initialRounds);
    const [scores, setScores] = useState(() =>
        Object.fromEntries(initialTeams.map((t) => [t.id, ''])),
    );
    const [isSaving, setIsSaving] = useState(false);
    const [inputErrors, setInputErrors] = useState({});
    const [saveError, setSaveError] = useState('');

    // Sync from parent whenever initialTeams/initialRounds references change (data loaded or game changed)
    useEffect(() => {
        setTeams(initialTeams);
        setRounds(initialRounds);
        setScores(Object.fromEntries(initialTeams.map((t) => [t.id, ''])));
        setInputErrors({});
        setSaveError('');
    }, [initialTeams, initialRounds]);

    const handleScoreChange = (teamId, value) => {
        setScores((prev) => ({ ...prev, [teamId]: value }));
        setInputErrors((prev) => ({ ...prev, [teamId]: undefined }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setInputErrors({});
        setSaveError('');

        const newErrors = {};

        for (const team of teams) {
            const val = scores[team.id];

            if (val === '' || val === undefined || val === null) {
                newErrors[team.id] = 'Score is required.';
            } else if (! Number.isInteger(Number(val))) {
                newErrors[team.id] = 'Score must be a whole number.';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setInputErrors(newErrors);

            return;
        }

        setIsSaving(true);

        try {
            const response = await axios.post(
                `/api/v1/games/${selectedGame.id}/rounds`,
                {
                    scores: teams.map((t) => ({
                        team_id: t.id,
                        points: Number(scores[t.id]),
                    })),
                },
            );

            const gameSummary = response.data?.data?.game ?? {};

            const updatedTeams = gameSummary.teams ?? teams;
            setTeams(updatedTeams);
            setRounds(gameSummary.rounds ?? rounds);
            setScores(Object.fromEntries(teams.map((t) => [t.id, ''])));
            onRoundRecorded?.(updatedTeams);
        } catch {
            setSaveError('Unable to record the round right now.');
        } finally {
            setIsSaving(false);
        }
    };

    const nextRound = rounds.length + 1;

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                <div className="max-w-2xl space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                        Rounds &amp; Scoring
                    </p>
                    <h3 className="text-2xl font-semibold text-slate-900">
                        Record scores and track round history.
                    </h3>
                    <p className="text-sm text-slate-600">
                        Enter each team&apos;s score after every round to keep
                        the scoreboard up to date.
                    </p>
                </div>

            </div>

            {! selectedGame ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Select a game above to record rounds.
                </p>
            ) : isFetching && teams.length < 2 ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Loading rounds…
                </p>
            ) : teams.length < 2 ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Add both teams before recording rounds.
                </p>
            ) : (
                <>
                    <div className="border-b border-slate-100 px-6 py-5">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            Round {nextRound}
                        </p>

                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {teams.map((team) => (
                                    <div key={team.id} className="space-y-1">
                                        <InputLabel
                                            htmlFor={`score-${team.id}`}
                                            value={team.name}
                                        />
                                        <TextInput
                                            className="block w-full rounded-xl"
                                            id={`score-${team.id}`}
                                            onChange={(e) =>
                                                handleScoreChange(
                                                    team.id,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="0"
                                            step="1"
                                            type="number"
                                            value={scores[team.id] ?? ''}
                                        />
                                        <InputError
                                            message={inputErrors[team.id]}
                                        />
                                    </div>
                                ))}
                            </div>

                            <InputError className="mt-3" message={saveError} />

                            <div className="mt-4 flex justify-end">
                                <PrimaryButton
                                    disabled={isSaving}
                                    type="submit"
                                >
                                    {isSaving ? 'Recording…' : 'Record Round'}
                                </PrimaryButton>
                            </div>
                        </form>
                    </div>

                    <div className="px-6 py-5">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            Round History
                        </p>

                        {rounds.length === 0 ? (
                            <p className="text-sm italic text-slate-400">
                                No rounds recorded yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="pb-2 text-left text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Round
                                            </th>
                                            {teams.map((t) => (
                                                <th
                                                    key={t.id}
                                                    className="pb-2 text-right text-xs font-semibold uppercase tracking-[0.25em] text-slate-400"
                                                >
                                                    {t.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {rounds.map((round) => (
                                            <tr key={round.round_number}>
                                                <td className="py-2 font-medium text-slate-700">
                                                    {round.round_number}
                                                </td>
                                                {teams.map((t) => {
                                                    const s = round.scores.find(
                                                        (sc) =>
                                                            sc.team_id === t.id,
                                                    );

                                                    return (
                                                        <td
                                                            key={t.id}
                                                            className="py-2 text-right text-slate-700"
                                                        >
                                                            {s ? s.points : '—'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
