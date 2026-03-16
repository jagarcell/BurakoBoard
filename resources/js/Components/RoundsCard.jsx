import axios from 'axios';
import { Fragment, useEffect, useRef, useState } from 'react';
import BaseElementsInput from '@/Components/BaseElementsInput';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';
import useWinnerSound from '@/hooks/useWinnerSound';

export default function RoundsCard({ selectedGame, initialTeams = [], initialRounds = [], onRoundRecorded, isFetching = false, hasTwoTeams = false }) {
    const [teams, setTeams] = useState(initialTeams);
    const [rounds, setRounds] = useState(initialRounds);
    const [elements, setElements] = useState([]);
    const [baseInputs, setBaseInputs] = useState({});
    const [cardInputs, setCardInputs] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [inputErrors, setInputErrors] = useState({});
    const [saveError, setSaveError] = useState('');
    const [gameStatus, setGameStatus] = useState(selectedGame?.status ?? 'in_progress');

    const { unlock: unlockWinnerSound, play: playWinnerSound } = useWinnerSound();

    const [expandedRound, setExpandedRound] = useState(null);
    const [collapsedTeams, setCollapsedTeams] = useState(new Set());

    // Always-current ref so the matchMedia handler below can read collapsedTeams
    // without needing to re-register the listener on every state change.
    const collapsedTeamsRef = useRef(collapsedTeams);
    useEffect(() => { collapsedTeamsRef.current = collapsedTeams; }, [collapsedTeams]);

    // Holds the stacked-layout collapse state so it can be restored when the
    // viewport transitions back from a non-stacked (sm+) width.
    const savedCollapsedTeamsRef = useRef(new Set());

    // Expand all team score cards when the viewport is non-stacked (sm+) so
    // both inputs are always visible side-by-side.  When the viewport returns
    // to a stacked layout the per-team collapse state is restored.
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const mq = window.matchMedia('(min-width: 640px)');

        if (mq.matches) {
            savedCollapsedTeamsRef.current = new Set(collapsedTeamsRef.current);
            setCollapsedTeams(new Set());
        }

        const handleChange = (e) => {
            if (e.matches) {
                savedCollapsedTeamsRef.current = new Set(collapsedTeamsRef.current);
                setCollapsedTeams(new Set());
            } else {
                setCollapsedTeams(new Set(savedCollapsedTeamsRef.current));
            }
        };

        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleTeamCollapse = (teamId) =>
        setCollapsedTeams((prev) => {
            const next = new Set(prev);
            if (next.has(teamId)) next.delete(teamId);
            else next.add(teamId);
            return next;
        });
    // Cache of per-round draft data keyed by round_number.
    const [roundDraftCache, setRoundDraftCache] = useState({});
    const [loadingDraftRound, setLoadingDraftRound] = useState(null);

    // Collapse any expanded round detail when the user clicks anywhere outside a round toggle.
    useEffect(() => {
        const collapse = () => setExpandedRound(null);
        document.addEventListener('click', collapse);
        return () => document.removeEventListener('click', collapse);
    }, []);

    // Collapse any expanded round detail when the selected game changes.
    useEffect(() => {
        setExpandedRound(null);
        setRoundDraftCache((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    }, [selectedGame?.id]);

    // Fetch the archived draft for a round when it is expanded, using a cache
    // so each round is only fetched once per game session.
    useEffect(() => {
        if (expandedRound === null || !selectedGame?.id) return;
        if (roundDraftCache[expandedRound] !== undefined) return;

        let cancelled = false;
        setLoadingDraftRound(expandedRound);

        axios
            .get(`/api/v1/games/${selectedGame.id}/rounds/${expandedRound}/draft`)
            .then((response) => {
                if (cancelled) return;
                const draft = response.data?.data?.round_draft ?? null;
                setRoundDraftCache((prev) => ({ ...prev, [expandedRound]: draft }));
            })
            .catch(() => {
                if (!cancelled) {
                    setRoundDraftCache((prev) => ({ ...prev, [expandedRound]: null }));
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingDraftRound(null);
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedRound]);

    // Tracks whether the draft for the current game has been fetched so the
    // auto-save effect is blocked until the initial draft load is complete.
    const draftLoadedRef = useRef(false);
    // When true, the very next auto-save is skipped (used after round submission
    // to prevent saving the reset-to-default inputs as a new draft).
    const skipNextDraftSave = useRef(false);
    const draftSaveTimerRef = useRef(null);
    // Always-current reference to selectedGame used inside debounced callbacks.
    const selectedGameRef = useRef(selectedGame);
    useEffect(() => { selectedGameRef.current = selectedGame; }, [selectedGame]);

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

    const buildDefaultCardInputs = (teamList) =>
        Object.fromEntries(teamList.map((t) => [t.id, { cardsInHand: 0, cardsOnTable: 0 }]));

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
        setCardInputs((prev) => {
            const newIds = new Set(initialTeams.map((t) => t.id));
            const prevIds = new Set(Object.keys(prev).map(Number));
            const same =
                newIds.size === prevIds.size &&
                [...newIds].every((id) => prevIds.has(id));

            return same ? prev : buildDefaultCardInputs(initialTeams);
        });
        setInputErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        setSaveError((prev) => (prev !== '' ? '' : prev));
    }, [initialTeams, initialRounds]);

    // Reset game status when the selected game changes
    useEffect(() => {
        setGameStatus(selectedGame?.status ?? 'in_progress');
    }, [selectedGame?.id]);

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

    // Fetch the saved draft for the current game once elements are available.
    // Runs on mount (after elements load) and whenever the selected game changes.
    // Draft values overlay any defaults that were populated by the effects above.
    useEffect(() => {
        if (!selectedGame?.id || elements.length === 0) return;

        draftLoadedRef.current = false;
        let cancelled = false;

        axios
            .get(`/api/v1/games/${selectedGame.id}/round-draft`)
            .then((response) => {
                if (cancelled) return;
                const draft = response.data?.data?.round_draft;
                if (draft?.base_inputs) setBaseInputs(draft.base_inputs);
                if (draft?.card_inputs) setCardInputs(draft.card_inputs);
            })
            .catch(() => { /* silently ignore – leave defaults in place */ })
            .finally(() => {
                if (!cancelled) draftLoadedRef.current = true;
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGame?.id, elements.length]);

    // Debounced auto-save: persist inputs to round-draft whenever they change,
    // but only after the initial draft fetch has completed and the form is active.
    useEffect(() => {
        if (!draftLoadedRef.current || !selectedGameRef.current?.id) return;
        if (selectedGameRef.current.status === 'finished') return;

        if (skipNextDraftSave.current) {
            skipNextDraftSave.current = false;
            return;
        }

        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);

        draftSaveTimerRef.current = setTimeout(() => {
            const game = selectedGameRef.current;
            if (game?.id) {
                axios.put(`/api/v1/games/${game.id}/round-draft`, {
                    base_inputs: baseInputs,
                    card_inputs: cardInputs,
                }).catch(() => { /* silently ignore draft save failures */ });
            }
        }, 800);

        return () => {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseInputs, cardInputs]);

    const handleElementChange = (teamId, elementId, value) => {
        setBaseInputs((prev) => {
            const el = elements.find((e) => e.id === elementId);
            const next = {
                ...prev,
                [teamId]: { ...prev[teamId], [elementId]: value },
            };

            // When a mutually-exclusive boolean is checked, uncheck it for all other teams.
            if (el?.input_type === 'boolean' && el?.mutually_exclusive && value === true) {
                for (const t of Object.keys(next)) {
                    if (Number(t) !== teamId) {
                        next[t] = { ...next[t], [elementId]: false };
                    }
                }
            }

            return next;
        });
        setInputErrors((prev) => {
            const key = `${teamId}_${elementId}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];

            return next;
        });
    };

    const handleCardChange = (teamId, field, value) => {
        setCardInputs((prev) => ({
            ...prev,
            [teamId]: { ...prev[teamId], [field]: value },
        }));
        setInputErrors((prev) => {
            const key = `${teamId}_${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];

            return next;
        });
    };

    const computeTeamScore = (teamId) => {
        const inHand = parseInt(cardInputs[teamId]?.cardsInHand, 10) || 0;
        const onTable = parseInt(cardInputs[teamId]?.cardsOnTable, 10) || 0;

        const scoreOverrideActive = elements.some(
            (el) => el.score_override && !!baseInputs[teamId]?.[el.id],
        );

        const baseScore = elements.reduce((sum, el) => {
            const val = baseInputs[teamId]?.[el.id];

            if (el.input_type === 'boolean') {
                const isActive = !!val;

                return sum + (isActive ? el.points : -(el.penalty ?? 0));
            }

            const qty = parseInt(val, 10) || 0;

            return sum + (qty > 0 ? el.points * qty : -(el.penalty ?? 0));
        }, 0);

        // Cards on table is subtracted when all scoring canastras are zero OR
        // when a score_override element is active.
        const canastrasAllZero = elements
            .filter((el) => el.name.includes('canastra') && !el.score_override)
            .every((el) => {
                const val = baseInputs[teamId]?.[el.id];

                return el.input_type === 'boolean' ? !val : (parseInt(val, 10) || 0) === 0;
            });

        return (scoreOverrideActive || canastrasAllZero)
            ? baseScore - inHand - onTable
            : baseScore - inHand + onTable;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Unlock AudioContext synchronously while the user-gesture is still
        // live so the victory fanfare works on iOS Safari.
        unlockWinnerSound();
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

            const inHand = cardInputs[team.id]?.cardsInHand ?? 0;

            if (!Number.isInteger(Number(inHand)) || Number(inHand) < 0) {
                newErrors[`${team.id}_cardsInHand`] = 'Cards in hand must be a whole number ≥ 0.';
            }

            const onTable = cardInputs[team.id]?.cardsOnTable ?? 0;

            if (!Number.isInteger(Number(onTable)) || Number(onTable) < 0) {
                newErrors[`${team.id}_cardsOnTable`] = 'Points on table must be a whole number ≥ 0.';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setInputErrors(newErrors);

            return;
        }

        setExpandedRound(null);
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

            const newGameStatus = gameSummary.game?.status ?? gameStatus;
            setTeams(updatedTeams);
            setRounds(gameSummary.rounds ?? rounds);
            setGameStatus(newGameStatus);
            if (newGameStatus === 'finished') playWinnerSound();
            // Cancel any pending draft save and skip the next one triggered by
            // the input reset below — the backend already deleted the draft.
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
            skipNextDraftSave.current = true;
            setBaseInputs(buildDefaultBaseInputs(updatedTeams, elements));
            setCardInputs(buildDefaultCardInputs(updatedTeams));
            onRoundRecorded?.(updatedTeams, newGameStatus);
        } catch {
            setSaveError('Unable to record the round right now.');
        } finally {
            setIsSaving(false);
        }
    };

    const getAccruedScore = (teamId) =>
        rounds.reduce((sum, round) => {
            const s = round.scores?.find((sc) => sc.team_id === teamId);
            return sum + (s ? s.points : 0);
        }, 0);

    const nextRound = rounds.length + 1;
    const showScoringForm = hasTwoTeams || teams.length >= 2;

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
            ) : isFetching && ! showScoringForm ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Loading rounds…
                </p>
            ) : ! showScoringForm ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Add both teams before recording rounds.
                </p>
            ) : (
                <>
                    {gameStatus === 'finished' ? (
                        <div className="border-b border-slate-100 px-6 py-5">
                            <p className="text-sm font-medium text-slate-500">
                                This game has concluded — no further rounds can be recorded.
                            </p>
                        </div>
                    ) : (
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
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-700">
                                                    {team.name}
                                                </p>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-medium text-slate-400">
                                                        Partial Score:
                                                    </span>
                                                    <span
                                                        className="text-sm font-semibold tabular-nums text-indigo-600"
                                                        title="Accrued score + this round"
                                                    >
                                                        {getAccruedScore(team.id) + computeTeamScore(team.id)}
                                                    </span>
                                                    <button
                                                        aria-expanded={!collapsedTeams.has(team.id)}
                                                        aria-label={`${collapsedTeams.has(team.id) ? 'Expand' : 'Collapse'} ${team.name} score inputs`}
                                                        className="sm:hidden inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                                        onClick={() => toggleTeamCollapse(team.id)}
                                                        type="button"
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            className={`h-4 w-4 transition-transform duration-200 ${collapsedTeams.has(team.id) ? '-rotate-90' : 'rotate-0'}`}
                                                            fill="currentColor"
                                                            viewBox="0 0 20 20"
                                                        >
                                                            <path
                                                                clipRule="evenodd"
                                                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                                                fillRule="evenodd"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {!collapsedTeams.has(team.id) && (elements.length === 0 ? (
                                                <p className="text-xs text-slate-400">
                                                    Loading elements…
                                                </p>
                                            ) : (
                                                <BaseElementsInput
                                                    cardErrors={{
                                                        cardsInHand: inputErrors[`${team.id}_cardsInHand`],
                                                        cardsOnTable: inputErrors[`${team.id}_cardsOnTable`],
                                                    }}
                                                    cardsInHand={cardInputs[team.id]?.cardsInHand ?? 0}
                                                    cardsOnTable={cardInputs[team.id]?.cardsOnTable ?? 0}
                                                    elements={elements}
                                                    errors={Object.fromEntries(
                                                        Object.entries(inputErrors)
                                                            .filter(([k]) =>
                                                                k.startsWith(`${team.id}_`) &&
                                                                !k.endsWith('_cardsInHand') &&
                                                                !k.endsWith('_cardsOnTable'),
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
                                                    onCardsChange={(field, val) =>
                                                        handleCardChange(team.id, field, val)
                                                    }
                                                    teamId={team.id}
                                                    values={baseInputs[team.id] ?? {}}
                                                />
                                            ))}
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
                    )}

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
                                            <th className="pb-2 pl-3 w-8" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {rounds.map((round) => (
                                            <Fragment key={round.round_number}>
                                                <tr>
                                                    <td className="py-2 font-medium text-slate-700">
                                                        {round.round_number}
                                                    </td>
                                                    {teams.map((t) => {
                                                        const s = round.scores.find(
                                                            (sc) => sc.team_id === t.id,
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
                                                    <td className="py-2 pl-3 text-right">
                                                        <button
                                                            aria-expanded={expandedRound === round.round_number}
                                                            aria-label={`${expandedRound === round.round_number ? 'Collapse' : 'Expand'} round ${round.round_number} detail`}
                                                            className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedRound((prev) =>
                                                                    prev === round.round_number
                                                                        ? null
                                                                        : round.round_number,
                                                                );
                                                            }}
                                                            type="button"
                                                        >
                                                            <svg
                                                                aria-hidden="true"
                                                                className={`h-4 w-4 transition-transform duration-200 ${
                                                                    expandedRound === round.round_number
                                                                        ? 'rotate-180'
                                                                        : ''
                                                                }`}
                                                                fill="currentColor"
                                                                viewBox="0 0 20 20"
                                                            >
                                                                <path
                                                                    clipRule="evenodd"
                                                                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                                                    fillRule="evenodd"
                                                                />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>

                                                {expandedRound === round.round_number && (
                                                    <tr>
                                                        <td
                                                            className="pb-3 pt-0"
                                                            colSpan={teams.length + 2}
                                                        >
                                                            <div className="rounded-xl border border-indigo-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_60%),linear-gradient(135deg,_#eef2ff_0%,_#f8fafc_100%)] px-4 py-4">
                                                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">
                                                                    Round {round.round_number} — Scoring Detail
                                                                </p>

                                                                {loadingDraftRound === round.round_number ? (
                                                                    <p className="text-xs text-slate-400">Loading detail…</p>
                                                                ) : (
                                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                        {teams.map((t) => {
                                                                            const draft = roundDraftCache[round.round_number];
                                                                            const draftBase = draft?.base_inputs?.[t.id] ?? draft?.base_inputs?.[String(t.id)] ?? {};
                                                                            const draftCards = draft?.card_inputs?.[t.id] ?? draft?.card_inputs?.[String(t.id)] ?? {};

                                                                            return (
                                                                                <div
                                                                                    key={t.id}
                                                                                    className="rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm"
                                                                                >
                                                                                    <p className="mb-3 text-xs font-semibold text-indigo-500">
                                                                                        {t.name}
                                                                                    </p>

                                                                                    {draft === null || elements.length === 0 ? (
                                                                                        <p className="text-xs italic text-slate-400">
                                                                                            No scoring detail captured for this round.
                                                                                        </p>
                                                                                    ) : (
                                                                                        <BaseElementsInput
                                                                                            cardsInHand={draftCards.cardsInHand ?? 0}
                                                                                            cardsOnTable={draftCards.cardsOnTable ?? 0}
                                                                                            elements={elements}
                                                                                            readOnly
                                                                                            teamId={`hist-${round.round_number}-${t.id}`}
                                                                                            values={draftBase}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
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
