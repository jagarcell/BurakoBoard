import BaseElementsInput from '@/Components/BaseElementsInput';
import PlayerCircle from '@/Components/PlayerCircle';

/**
 * Read-only scoring panel shown to viewers (non-scorers) during the active round.
 *
 * @param {object}       props
 * @param {Array}        props.teams                       - The two game teams.
 * @param {Array}        props.elements                    - Base scoring elements (for labels/types).
 * @param {object}       props.baseInputs                  - Live base-element input state keyed by team ID.
 * @param {object}       props.cardInputs                  - Live card-count input state keyed by team ID.
 * @param {number}       props.nextRound                   - The current (upcoming) round number.
 * @param {object|null}  props.currentRoundRolesForPanel   - Role assignment object for the next round.
 * @param {number|null}  props.activeCircleRound           - Round number whose circle is currently open.
 * @param {number|null}  props.closingCircleRound          - Round number whose circle is currently closing.
 * @param {DOMRect|null} props.circleButtonRect            - Bounding rect of the circle trigger button.
 * @param {function}     props.computeTeamScore            - (teamId) => number — live round score.
 * @param {function}     props.getAccruedScore             - (teamId) => number — accrued score so far.
 * @param {function}     props.onToggleCircle              - (e, roundNumber) => void — circle toggle handler.
 * @return {JSX.Element}
 *
 * Logic: Receives all state as props from RoundsCard and renders the live read-only
 * preview tiles for each team. The player-circle overlay is shown when the circle
 * toggle is active; otherwise the two team tiles with their BaseElementsInput (in readOnly
 * mode) are rendered. Score badges are derived from computeTeamScore and getAccruedScore
 * using the same color-coding logic as the scorer view.
 */
export default function ViewerRoundPanel({
    teams,
    elements,
    baseInputs,
    cardInputs,
    nextRound,
    currentRoundRolesForPanel,
    activeCircleRound,
    closingCircleRound,
    circleButtonRect,
    computeTeamScore,
    getAccruedScore,
    onToggleCircle,
}) {
    return (
        <div className="border-b border-slate-100 px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Round {nextRound}
                </p>
                <div className="flex items-center gap-1">
                    <button
                        aria-expanded={activeCircleRound === nextRound}
                        aria-label={`${activeCircleRound === nextRound ? 'Hide' : 'Show'} seating circle for round ${nextRound}`}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                            activeCircleRound === nextRound
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                        }`}
                        onClick={(e) => onToggleCircle(e, nextRound)}
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
                    <span
                        aria-label="Receiving live score updates"
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600"
                    >
                        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                        Live
                    </span>
                </div>
            </div>

            {(activeCircleRound === nextRound || closingCircleRound === nextRound) && (
                <div className="mb-4 flex justify-center overflow-visible">
                    <PlayerCircle
                        buttonRect={circleButtonRect}
                        isOpen={activeCircleRound === nextRound}
                        players={teams.flatMap((t) => t.players)}
                        roundNumber={nextRound}
                        roundRoles={currentRoundRolesForPanel}
                    />
                </div>
            )}

            {activeCircleRound !== nextRound && closingCircleRound !== nextRound && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {teams.map((team) => {
                        const roundScore = computeTeamScore(team.id);
                        const partialScore = getAccruedScore(team.id) + roundScore;
                        const other = teams.find((t) => t.id !== team.id);
                        const otherPartial = other
                            ? getAccruedScore(other.id) + computeTeamScore(other.id)
                            : null;
                        const bothPos =
                            partialScore > 0 &&
                            otherPartial !== null &&
                            otherPartial > 0;
                        const partialChipCls =
                            partialScore < 0
                                ? 'bg-red-100 text-red-800'
                                : partialScore === 0
                                    ? 'bg-[bisque] text-green-700'
                                    : bothPos && partialScore < otherPartial
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-green-100 text-green-800';
                        const roundChipCls =
                            roundScore < 0
                                ? 'bg-red-100 text-red-800'
                                : roundScore === 0
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-indigo-100 text-indigo-800';

                        return (
                            <div key={team.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-700">
                                        {team.name}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-slate-400">Round:</span>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${roundChipCls}`}
                                            title="This round's score"
                                        >
                                            {roundScore}
                                        </span>
                                        <span className="text-xs font-medium text-slate-400">Total:</span>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${partialChipCls}`}
                                            title="Accrued score + this round"
                                        >
                                            {partialScore}
                                        </span>
                                    </div>
                                </div>
                                {elements.length === 0 ? (
                                    <p className="text-xs text-slate-400">Loading elements…</p>
                                ) : (
                                    <BaseElementsInput
                                        cardsInHand={cardInputs[team.id]?.cardsInHand ?? 0}
                                        cardsOnTable={cardInputs[team.id]?.cardsOnTable ?? 0}
                                        elements={elements}
                                        readOnly
                                        teamId={team.id}
                                        values={baseInputs[team.id] ?? {}}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
