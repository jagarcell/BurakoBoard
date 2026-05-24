import { Fragment, useEffect, useState } from 'react';
import BaseElementsInput from '@/Components/BaseElementsInput';
import PlayerCircle from '@/Components/PlayerCircle';

/**
 * Renders the round-history table with expandable scoring-detail rows and
 * player-circle overlays.
 *
 * @param {object}       props
 * @param {Array}        props.rounds               - Ordered array of completed round objects.
 * @param {Array}        props.teams                - The two game teams.
 * @param {Array}        props.roundRoles           - Role assignment objects indexed by round_number.
 * @param {Array}        props.elements             - Base scoring elements (for detail labels/types).
 * @param {object}       props.roundDraftCache      - Cache of archived draft objects keyed by round_number.
 * @param {number|null}  props.loadingDraftRound    - Round number whose draft is currently fetching.
 * @param {number|null}  props.expandedRound        - Currently expanded round number, or null.
 * @param {number|null}  props.activeCircleRound    - Round number whose circle is currently open.
 * @param {number|null}  props.closingCircleRound   - Round number whose circle is currently closing.
 * @param {DOMRect|null} props.circleButtonRect     - Bounding rect of the most recently clicked circle button.
 * @param {boolean}      props.hasMoreRounds        - Whether earlier rounds can still be loaded.
 * @param {boolean}      props.isLoadingMoreRounds  - Whether an earlier-rounds fetch is in flight.
 * @param {function}     props.onExpandRound        - (roundNumber) => void — toggles the detail row.
 * @param {function}     props.onToggleCircle       - (e, roundNumber) => void — circle toggle handler.
 * @param {function}     props.onLoadEarlier        - () => void — triggers a load-earlier-rounds fetch.
 * @return {JSX.Element}
 *
 * Logic: Renders a scrollable table of all completed rounds. Each row shows round number
 * and per-team score badges with color-coding. An expand button toggles a detail panel
 * with the archived BaseElementsInput snapshot (from roundDraftCache). A circle button
 * opens the PlayerCircle overlay for that round's seating assignment. When more rounds
 * exist beyond the loaded window a "Load earlier rounds" button is shown at the top.
 */
export default function RoundHistoryTable({
    rounds,
    teams,
    canAmend = false,
    roundRoles,
    elements,
    roundDraftCache,
    loadingDraftRound,
    expandedRound,
    activeCircleRound,
    closingCircleRound,
    circleButtonRect,
    hasMoreRounds,
    isLoadingMoreRounds,
    onExpandRound,
    onToggleCircle,
    onLoadEarlier,
    onSaveAmend,
    onAmendModeChange,
}) {
    const [amendModeByRound, setAmendModeByRound] = useState({});
    const [editedDraftByRound, setEditedDraftByRound] = useState({});
    const [isSavingAmendByRound, setIsSavingAmendByRound] = useState({});

    useEffect(() => {
        const isAnyRoundInAmendMode = Object.values(amendModeByRound).some(Boolean);
        onAmendModeChange?.(isAnyRoundInAmendMode);
    }, [amendModeByRound, onAmendModeChange]);

    const ensureEditableDraft = (roundNumber) => {
        const draft = roundDraftCache[roundNumber];
        if (!draft || editedDraftByRound[roundNumber]) return;

        setEditedDraftByRound((prev) => ({
            ...prev,
            [roundNumber]: {
                base_inputs: structuredClone(draft.base_inputs ?? {}),
                card_inputs: structuredClone(draft.card_inputs ?? {}),
            },
        }));
    };

    const handleToggleAmendMode = (roundNumber) => {
        setAmendModeByRound((prev) => {
            const next = !prev[roundNumber];
            if (next) ensureEditableDraft(roundNumber);
            return { ...prev, [roundNumber]: next };
        });
    };

    const handleAmendedBaseChange = (roundNumber, teamId, elementId, value) => {
        setEditedDraftByRound((prev) => {
            const currentRound = prev[roundNumber] ?? {
                base_inputs: structuredClone(roundDraftCache[roundNumber]?.base_inputs ?? {}),
                card_inputs: structuredClone(roundDraftCache[roundNumber]?.card_inputs ?? {}),
            };
            const teamInputs = currentRound.base_inputs?.[teamId] ?? currentRound.base_inputs?.[String(teamId)] ?? {};

            return {
                ...prev,
                [roundNumber]: {
                    ...currentRound,
                    base_inputs: {
                        ...currentRound.base_inputs,
                        [teamId]: {
                            ...teamInputs,
                            [elementId]: value,
                        },
                    },
                },
            };
        });
    };

    const handleAmendedCardChange = (roundNumber, teamId, field, value) => {
        setEditedDraftByRound((prev) => {
            const currentRound = prev[roundNumber] ?? {
                base_inputs: structuredClone(roundDraftCache[roundNumber]?.base_inputs ?? {}),
                card_inputs: structuredClone(roundDraftCache[roundNumber]?.card_inputs ?? {}),
            };
            const teamCards = currentRound.card_inputs?.[teamId] ?? currentRound.card_inputs?.[String(teamId)] ?? {};

            return {
                ...prev,
                [roundNumber]: {
                    ...currentRound,
                    card_inputs: {
                        ...currentRound.card_inputs,
                        [teamId]: {
                            ...teamCards,
                            [field]: value,
                        },
                    },
                },
            };
        });
    };

    const computeTeamScore = (baseValues, cardValues) => {
        const inHand = parseInt(cardValues?.cardsInHand, 10) || 0;
        const onTable = parseInt(cardValues?.cardsOnTable, 10) || 0;

        const scoreOverrideActive = elements.some(
            (el) => el.score_override && !!baseValues?.[el.id],
        );

        const baseScore = elements.reduce((sum, el) => {
            const val = baseValues?.[el.id];

            if (el.input_type === 'boolean') {
                const isActive = !!val;
                return sum + (isActive ? el.points : -(el.penalty ?? 0));
            }

            const qty = parseInt(val, 10) || 0;
            return sum + (qty > 0 ? el.points * qty : -(el.penalty ?? 0));
        }, 0);

        const canastrasAllZero = elements
            .filter((el) => el.name.includes('canastra') && !el.score_override)
            .every((el) => {
                const val = baseValues?.[el.id];
                return el.input_type === 'boolean' ? !val : (parseInt(val, 10) || 0) === 0;
            });

        return (scoreOverrideActive || canastrasAllZero)
            ? baseScore - inHand - onTable
            : baseScore - inHand + onTable;
    };

    const handleSaveAmend = async (round) => {
        if (!canAmend || !onSaveAmend) return;

        const roundNumber = round.round_number;
        const persisted = roundDraftCache[roundNumber] ?? { base_inputs: {}, card_inputs: {} };
        const edited = editedDraftByRound[roundNumber] ?? persisted;
        const baseInputs = edited.base_inputs ?? {};
        const cardInputs = edited.card_inputs ?? {};

        const scores = teams.map((team) => {
            const teamBase = baseInputs?.[team.id] ?? baseInputs?.[String(team.id)] ?? {};
            const teamCards = cardInputs?.[team.id] ?? cardInputs?.[String(team.id)] ?? {};

            return {
                team_id: team.id,
                points: computeTeamScore(teamBase, teamCards),
            };
        });

        setIsSavingAmendByRound((prev) => ({ ...prev, [roundNumber]: true }));
        try {
            const saved = await onSaveAmend(roundNumber, {
                scores,
                base_inputs: baseInputs,
                card_inputs: cardInputs,
            });

            if (saved) {
                setAmendModeByRound((prev) => ({ ...prev, [roundNumber]: false }));
            }
        } finally {
            setIsSavingAmendByRound((prev) => ({ ...prev, [roundNumber]: false }));
        }
    };

    return (
        <div className="px-6 py-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Round History
            </p>

            {hasMoreRounds && (
                <div className="mb-3 flex justify-center">
                    <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                        disabled={isLoadingMoreRounds}
                        onClick={onLoadEarlier}
                        type="button"
                    >
                        {isLoadingMoreRounds ? (
                            <>
                                <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                                </svg>
                                Loading…
                            </>
                        ) : (
                            <>
                                <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Load earlier rounds
                            </>
                        )}
                    </button>
                </div>
            )}

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
                                <th className="pb-2 pl-3 w-16" />
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
                                            const s = round.scores.find((sc) => sc.team_id === t.id);
                                            const otherS = round.scores.find((sc) => sc.team_id !== t.id);
                                            const pts = s ? s.points : null;
                                            const otherPts = otherS ? otherS.points : null;
                                            const bothPos = pts !== null && pts > 0 && otherPts !== null && otherPts > 0;
                                            const chipCls = pts === null
                                                ? ''
                                                : pts < 0
                                                    ? 'bg-red-100 text-red-800'
                                                    : pts === 0
                                                        ? 'bg-[bisque] text-green-700'
                                                        : bothPos && pts < otherPts
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-green-100 text-green-800';

                                            return (
                                                <td key={t.id} className="py-2 text-right">
                                                    {pts !== null ? (
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipCls}`}>
                                                            {pts}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                            );
                                        })}
                                        <td className="py-2 pl-3 text-right">
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    aria-expanded={activeCircleRound === round.round_number}
                                                    aria-label={`${activeCircleRound === round.round_number ? 'Hide' : 'Show'} seating circle for round ${round.round_number}`}
                                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                                                        activeCircleRound === round.round_number
                                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                            : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                                                    }`}
                                                    onClick={(e) => onToggleCircle(e, round.round_number)}
                                                    type="button"
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        className="h-3.5 w-3.5"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                    >
                                                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    aria-expanded={expandedRound === round.round_number}
                                                    aria-label={`${expandedRound === round.round_number ? 'Collapse' : 'Expand'} round ${round.round_number} detail`}
                                                    className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onExpandRound(round.round_number);
                                                    }}
                                                    type="button"
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        className={`h-4 w-4 transition-transform duration-200 ${
                                                            expandedRound === round.round_number ? 'rotate-180' : ''
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
                                            </div>
                                        </td>
                                    </tr>

                                    {expandedRound === round.round_number && (
                                        <tr>
                                            <td className="pb-3 pt-0" colSpan={teams.length + 2}>
                                                <div
                                                    className="rounded-xl border border-indigo-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_60%),linear-gradient(135deg,_#eef2ff_0%,_#f8fafc_100%)] px-4 py-4"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">
                                                            Round {round.round_number} — Scoring Detail
                                                        </p>
                                                        {canAmend && (
                                                            <div className="flex items-center gap-2">
                                                                {amendModeByRound[round.round_number] && (
                                                                    <button
                                                                        aria-label={`Save amendment for round ${round.round_number}`}
                                                                        className="inline-flex items-center rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                        disabled={!!isSavingAmendByRound[round.round_number]}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSaveAmend(round);
                                                                        }}
                                                                        type="button"
                                                                    >
                                                                        {isSavingAmendByRound[round.round_number] ? 'Saving…' : 'Save Amend'}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    aria-label={`Amend round ${round.round_number}`}
                                                                    className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                                                                        amendModeByRound[round.round_number]
                                                                            ? 'bg-orange-600 hover:bg-orange-700'
                                                                            : 'bg-orange-500 hover:bg-orange-600'
                                                                    }`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleToggleAmendMode(round.round_number);
                                                                    }}
                                                                    type="button"
                                                                >
                                                                    Amend
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {loadingDraftRound === round.round_number ? (
                                                        <p className="text-xs text-slate-400">Loading detail…</p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                            {teams.map((t) => {
                                                                const draft = roundDraftCache[round.round_number];
                                                                const editedRoundDraft = editedDraftByRound[round.round_number] ?? null;
                                                                const isAmendMode = !!amendModeByRound[round.round_number];
                                                                const originalBase = draft?.base_inputs?.[t.id] ?? draft?.base_inputs?.[String(t.id)] ?? {};
                                                                const originalCards = draft?.card_inputs?.[t.id] ?? draft?.card_inputs?.[String(t.id)] ?? {};
                                                                const draftBase = isAmendMode
                                                                    ? (editedRoundDraft?.base_inputs?.[t.id] ?? editedRoundDraft?.base_inputs?.[String(t.id)] ?? originalBase)
                                                                    : originalBase;
                                                                const draftCards = isAmendMode
                                                                    ? (editedRoundDraft?.card_inputs?.[t.id] ?? editedRoundDraft?.card_inputs?.[String(t.id)] ?? originalCards)
                                                                    : originalCards;

                                                                const amendedElementIds = elements
                                                                    .filter((el) => {
                                                                        const before = originalBase?.[el.id] ?? 0;
                                                                        const after = draftBase?.[el.id] ?? 0;
                                                                        return String(before) !== String(after);
                                                                    })
                                                                    .map((el) => el.id);

                                                                const amendedCardFields = {
                                                                    cardsInHand: String(originalCards?.cardsInHand ?? 0) !== String(draftCards?.cardsInHand ?? 0),
                                                                    cardsOnTable: String(originalCards?.cardsOnTable ?? 0) !== String(draftCards?.cardsOnTable ?? 0),
                                                                };

                                                                const rs = round.scores.find((sc) => sc.team_id === t.id);
                                                                const otherRs = round.scores.find((sc) => sc.team_id !== t.id);
                                                                const pts = rs ? rs.points : null;
                                                                const otherPts = otherRs ? otherRs.points : null;
                                                                const bothPos = pts !== null && pts > 0 && otherPts !== null && otherPts > 0;
                                                                const chipCls = pts === null
                                                                    ? ''
                                                                    : pts < 0
                                                                        ? 'bg-red-100 text-red-800'
                                                                        : pts === 0
                                                                            ? 'bg-[bisque] text-green-700'
                                                                            : bothPos && pts < otherPts
                                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                                : 'bg-green-100 text-green-800';

                                                                return (
                                                                    <div
                                                                        key={t.id}
                                                                        className="rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm"
                                                                    >
                                                                        <div className="mb-3 flex items-center justify-between gap-2">
                                                                            <p className="text-xs font-semibold text-indigo-500">
                                                                                {t.name}
                                                                            </p>
                                                                            {pts !== null ? (
                                                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipCls}`}>
                                                                                    {pts}
                                                                                </span>
                                                                            ) : null}
                                                                        </div>

                                                                        {draft === null || elements.length === 0 ? (
                                                                            <p className="text-xs italic text-slate-400">
                                                                                No scoring detail captured for this round.
                                                                            </p>
                                                                        ) : (
                                                                            <BaseElementsInput
                                                                                amendedCardFields={amendedCardFields}
                                                                                amendedElementIds={amendedElementIds}
                                                                                cardsInHand={draftCards.cardsInHand ?? 0}
                                                                                cardsOnTable={draftCards.cardsOnTable ?? 0}
                                                                                elements={elements}
                                                                                onCardsChange={(field, value) =>
                                                                                    handleAmendedCardChange(round.round_number, t.id, field, value)
                                                                                }
                                                                                onChange={(elementId, value) =>
                                                                                    handleAmendedBaseChange(round.round_number, t.id, elementId, value)
                                                                                }
                                                                                readOnly={!isAmendMode}
                                                                                showCardScanner={false}
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

                                    {(activeCircleRound === round.round_number || closingCircleRound === round.round_number) && (
                                        <tr>
                                            <td className="pb-4 pt-0" colSpan={teams.length + 2}>
                                                <div className="flex justify-center overflow-visible">
                                                    <PlayerCircle
                                                        buttonRect={circleButtonRect}
                                                        isOpen={activeCircleRound === round.round_number}
                                                        players={teams.flatMap((t) => t.players)}
                                                        roundNumber={round.round_number}
                                                        roundRoles={
                                                            roundRoles.find(
                                                                (r) => Number(r.round_number) === round.round_number,
                                                            ) ?? null
                                                        }
                                                    />
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
    );
}
