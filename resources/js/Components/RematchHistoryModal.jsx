import api from '@/api/client';
import { useEffect, useState } from 'react';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';

/**
 * Derives the Tailwind chip colour for a score using the same logic as RoundsCard:
 * negative → red, zero → bisque/green, lower-of-two-positives → yellow, otherwise → green.
 *
 * @param {number}      pts      This team's current score.
 * @param {number|null} otherPts The other team's score, or null when unavailable.
 * @returns {string} Tailwind class string.
 */
function scoreChipCls(pts, otherPts) {
    if (pts < 0) return 'bg-red-100 text-red-800';
    if (pts === 0) return 'bg-[bisque] text-green-700';
    const bothPos = otherPts !== null && otherPts > 0;
    if (bothPos && pts < otherPts) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
}

/**
 * Renders score chips for each team in a chain game item.
 * Uses the same colour coding and pill shape as the round-score chips in RoundsCard.
 *
 * @param {Array<{team_id: number, team_name: string, current_score: number}>} teamScores
 * @returns {JSX.Element|null}
 */
function TeamScoreChips({ teamScores }) {
    if (!teamScores || teamScores.length === 0) return null;

    const other = teamScores.length === 2 ? teamScores : null;

    return (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {teamScores.map((ts) => {
                const pts = ts.current_score;
                const otherTs = other ? other.find((t) => t.team_id !== ts.team_id) : null;
                const cls = scoreChipCls(pts, otherTs ? otherTs.current_score : null);

                return (
                    <span
                        key={ts.team_id}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
                    >
                        {ts.team_name}: {pts}
                    </span>
                );
            })}
        </div>
    );
}

const STATUS_LABELS = {
    in_progress: 'In Progress',
    finished: 'Finished',
};

const STATUS_STYLES = {
    in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    finished: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

/**
 * Renders a status badge pill for a game chain item.
 *
 * @param {string} status  The game status string (e.g. 'in_progress', 'finished').
 * @returns {JSX.Element}  A styled span badge.
 */
function StatusBadge({ status }) {
    const label = STATUS_LABELS[status] ?? status;
    const style = STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';

    return (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
            {label}
        </span>
    );
}

/**
 * Renders the rematch history chain inside a Modal.
 * Fetches GET /v1/games/{gameId}/rematch-chain on open and displays each game
 * in the chain ordered from the root game to the latest rematch.
 * The currently selected game is highlighted and team final scores are shown
 * as coloured chips using the same colour coding as RoundsCard.
 *
 * @param {boolean}  isOpen         Whether the modal is visible.
 * @param {Function} onClose        Callback to close the modal.
 * @param {number|string|null} gameId       The game whose chain to load.
 * @param {number|string|null} currentGameId  ID of the game currently selected in the hub.
 * @returns {JSX.Element}
 */
export default function RematchHistoryModal({ isOpen, onClose, gameId, currentGameId }) {
    const [chain, setChain] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (! isOpen || ! gameId) {
            return;
        }

        let isActive = true;

        const fetchChain = async () => {
            setIsLoading(true);
            setError('');
            setChain([]);

            try {
                const response = await api.get(`/games/${gameId}/rematch-chain`);
                const games = response.data?.data?.games ?? [];

                if (isActive) {
                    setChain(games);
                }
            } catch {
                if (isActive) {
                    setError('Unable to load rematch history right now. Please try again.');
                }
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        fetchChain();

        return () => {
            isActive = false;
        };
    }, [isOpen, gameId]);

    return (
        <Modal maxWidth="lg" onClose={onClose} show={isOpen}>
            <div className="space-y-4 p-6">
                <div className="space-y-1">
                    <h4 className="text-lg font-semibold text-slate-900">
                        Rematch History
                    </h4>
                    <p className="text-sm text-slate-600">
                        Every match in this rematch chain, from the first game to the latest.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8" aria-label="Loading rematch history">
                        <svg
                            aria-hidden="true"
                            className="h-6 w-6 animate-spin text-indigo-500"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="opacity-75"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                fill="currentColor"
                            />
                        </svg>
                    </div>
                ) : error !== '' ? (
                    <p className="py-4 text-center text-sm font-medium text-red-600">
                        {error}
                    </p>
                ) : chain.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                        No chain data found.
                    </p>
                ) : (
                    <ol className="space-y-2" aria-label="Rematch chain">
                        {chain.map((game, index) => {
                            const isCurrent = String(game.id) === String(currentGameId);

                            return (
                                <li
                                    key={game.id}
                                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                                        isCurrent
                                            ? 'border-indigo-200 bg-indigo-50'
                                            : 'border-slate-100 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <span
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                            isCurrent
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}
                                        aria-hidden="true"
                                    >
                                        {index + 1}
                                    </span>

                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium text-slate-800">
                                            {game.name}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {game.target_points} pts
                                        </span>
                                        <TeamScoreChips teamScores={game.team_scores ?? []} />
                                    </span>

                                    <StatusBadge status={game.status} />

                                    {isCurrent && (
                                        <span className="shrink-0 text-xs font-medium text-indigo-600">
                                            Current
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}

                <div className="flex justify-end pt-1">
                    <SecondaryButton onClick={onClose} type="button">
                        Close
                    </SecondaryButton>
                </div>
            </div>
        </Modal>
    );
}
