import axios from 'axios';
import { useEffect, useState } from 'react';
import BaseElementsInput from '@/Components/BaseElementsInput';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';

export default function RoundsCard({ selectedGame, initialTeams = [], initialRounds = [], onRoundRecorded, isFetching = false }) {
    const [teams, setTeams] = useState(initialTeams);
    const [rounds, setRounds] = useState(initialRounds);
    const [elements, setElements] = useState([]);
    const [baseInputs, setBaseInputs] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [inputErrors, setInputErrors] = useState({});
    const [saveError, setSaveError] = useState('');

    // Fetch base elements once on mount
    useEffect(() => {
        axios.get('/api/v1/base-elements').then((response) => {
            const els = response.data?.data?.base_elements ?? [];
            setElements(els);
        });
    }, []);

    // Build the default per-element values for a set of teams
    const buildDefaultBaseInputs = (teamList, elementList) =>
        Object.fromEntries(
            teamList.map((t) => [
                t.id,
                Object.fromEntries(
                    elementList.map((el) => [
                        el.id,
                        el.input_type === 'boolean' ? false : 0,
                    ]),
                ),
            ]),
        );

    // Sync from parent whenever initialTeams/initialRounds references change
    useEffect(() => {
        setTeams(initialTeams);
        setRounds(initialRounds);
        setBaseInputs((prev) => {
            const newIds = new Set(initialTeams.map((t) => t.id));
            const prevIds = new Set(Object.keys(prev).map(Number));
            const same =
                newIds.size === prevIds.size &&
                [...newIds].every((id) => prevIds.has(id));

            return same ? prev : buildDefaultBaseInputs(initialTeams, elements);
        });
        setInputErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        setSaveError((prev) => (prev !== '' ? '' : prev));
    }, [initialTeams, initialRounds]);

    // Also re-seed baseInputs when elements load (if teams are already present)
    useEffect(() => {
        if (elements.length > 0 && teams.length > 0) {
            setBaseInputs((prev) => {
                // Only reset if element keys have changed (first load)
                const firstTeamId = teams[0]?.id;
                const prevEls = Object.keys(prev[firstTeamId] ?? {}).map(Number);

                if (
                    prevEls.length === elements.length &&
                    elements.every((el) => prevEls.includes(el.id))
                ) {
                    return prev;
                }

                return buildDefaultBaseInputs(teams, elements);
            });
        }
    }, [elements]);

    const handleElementChange = (teamId, elementId, value) => {
        setBaseInputs((prev) => ({
            ...prev,
            [teamId]: { ...prev[teamId], [elementId]: value },
        }));
        setInputErrors((prev) => {
            const key = `${teamId}_${elementId}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];

            return next;
        });
    };

    const computeTeamScore = (teamId) =>
        elements.reduce((sum, el) => {
            const val = baseInputs[teamId]?.[el.id];

            if (el.input_type === 'boolean') {
                return sum + (val ? el.points : 0);
            }

            return sum + el.points * (parseInt(val, 10) || 0);
        }, 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setInputErrors({});
        setSaveError('');

        const newErrors = {};

        for (const team of teams) {
            for (const el of elements) {
                if (el.input_type === 'quantity') {
                    const val = baseInputs[team.id]?.[el.id] ?? 0;

                    if (!Number.isInteger(Number(val)) || Number(val) < 0) {
                        newErrors[`${team.id}_${el.id}`] =
                            `${el.label} must be a whole number ≥ 0.`;
                    }
                }
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
                        points: computeTeamScore(t.id),
                    })),
                },
            );

            const gameSummary = response.data?.data?.game ?? {};
            const updatedTeams = gameSummary.teams ?? teams;

            setTeams(updatedTeams);
            setRounds(gameSummary.rounds ?? rounds);
            setBaseInputs(buildDefaultBaseInputs(updatedTeams, elements));
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
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                {teams.map((team) => (
                                    <div
                                        key={team.id}
                                        className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                                    >
                                        <p className="mb-3 text-sm font-semibold text-slate-700">
                                            {team.name}
                                        </p>

                                        {elements.length === 0 ? (
                                            <p className="text-xs text-slate-400">
                                                Loading elements…
                                            </p>
                                        ) : (
                                            <BaseElementsInput
                                                elements={elements}
                                                errors={Object.fromEntries(
                                                    Object.entries(inputErrors)
                                                        .filter(([k]) =>
                                                            k.startsWith(`${team.id}_`),
                                                        )
                                                        .map(([k, v]) => [
                                                            parseInt(
                                                                k.split('_')[1],
                                                                10,
                                                            ),
                                                            v,
                                                        ]),
                                                )}
                                                onChange={(elId, val) =>
                                                    handleElementChange(
                                                        team.id,
                                                        elId,
                                                        val,
                                                    )
                                                }
                                                teamId={team.id}
                                                values={baseInputs[team.id] ?? {}}
                                            />
                                        )}
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
