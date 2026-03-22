import axios from 'axios';
import { useState } from 'react';

/**
 * Tailwind colour classes for each round role chip, mirroring PlayerCircle's ROLE_COLORS.
 *
 * @type {Record<string, string>}
 */
const ROLE_CHIP_COLORS = {
    Cutter: 'bg-blue-100 text-blue-700 border-blue-200',
    Dealer: 'bg-amber-100 text-amber-700 border-amber-200',
    'First Draw': 'bg-green-100 text-green-700 border-green-200',
};

/**
 * PlayerOrderCard
 *
 * Standalone card section that displays the round player order assignment panel.
 * For round 1 it allows picking the initial cutter; for subsequent rounds it
 * shows the assigned roles in read-only chip form.
 *
 * @param {Object}   props
 * @param {Object}   props.selectedGame   - The currently selected game object.
 * @param {Array}    props.teams          - Array of team objects (each with a `players` array).
 * @param {Object}   props.gameSummary    - Full game summary including round_roles and game meta.
 * @param {Function} props.onTeamsChange  - Callback invoked with (newTeams, newSummary) after
 *                                          the cutter is updated via the API.
 * @return {JSX.Element|null} The card section, or null when not applicable.
 *
 * Logic: Derives all display values (active round, cutter candidates, current roles) from the
 * received props without managing external state. Renders a card section matching the visual
 * style of the other board cards. Returns null when the game is not in progress, when the two
 * teams have different player counts, or when there is no active round to display.
 */
export default function PlayerOrderCard({ selectedGame, teams = [], gameSummary = null, onTeamsChange }) {
    const [cutterError, setCutterError] = useState('');
    const [collapsed, setCollapsed] = useState(false);

    const roundRoles = gameSummary?.round_roles ?? [];
    const lastCompletedRoundNumber = Number(
        gameSummary?.game?.current_round_number ?? selectedGame?.current_round_number ?? 0,
    );
    const initialCutterSeatNumber = gameSummary?.game?.initial_shuffler_seat_number ?? null;
    const isFirstRound = lastCompletedRoundNumber === 0;
    const activeRoundNumber = selectedGame?.status === 'in_progress'
        ? lastCompletedRoundNumber + 1
        : lastCompletedRoundNumber;

    const allSeatedPlayers = teams
        .flatMap((team) => team.players)
        .filter((player) => player.seat_number != null)
        .sort((a, b) => a.seat_number - b.seat_number);

    const allPlayers = teams
        .flatMap((team) => team.players)
        .sort((a, b) => a.id - b.id);

    const cutterCandidates = allSeatedPlayers.length > 0 ? allSeatedPlayers : allPlayers;

    const initialCutterPlayer =
        allSeatedPlayers.find((player) => player.seat_number === initialCutterSeatNumber) ?? null;

    const currentRoundRoles =
        roundRoles.find((roundRole) => Number(roundRole.round_number) === activeRoundNumber) ?? null;

    const isGameEditable = selectedGame?.status === 'in_progress';
    const playerCountMismatch =
        teams.length === 2 && teams[0].players.length !== teams[1].players.length;

    const canShow =
        isGameEditable &&
        teams.length === 2 &&
        ! playerCountMismatch &&
        (isFirstRound || activeRoundNumber > 1);

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

        if (currentRoundRoles.cutter?.player_id === playerId) return 'Cutter';
        if (currentRoundRoles.dealer?.player_id === playerId) return 'Dealer';
        if (currentRoundRoles.first_draw?.player_id === playerId) return 'First Draw';

        return null;
    };

    /**
     * Sends a PUT request to set the initial cutter for the game.
     *
     * @param {number} playerId - The ID of the player to designate as the initial cutter.
     * @return {Promise<void>}
     *
     * Logic: Calls the cutter API endpoint, then propagates the updated game summary to the
     * parent via onTeamsChange. On failure, extracts the first API error message and stores it
     * in local state for display.
     */
    const handleSetInitialCutter = async (playerId) => {
        try {
            const response = await axios.put(`/api/v1/games/${selectedGame.id}/shuffler`, {
                player_id: playerId,
            });

            const summary = response.data?.data?.game ?? {};
            const newTeams = summary.teams ?? [];
            onTeamsChange?.(newTeams, summary);
            setCutterError('');
        } catch (error) {
            const apiErrors = error.response?.data?.data?.errors ?? {};
            const firstApiError = Object.values(apiErrors).flat()[0];
            setCutterError(firstApiError || 'Unable to set the initial cutter right now.');
        }
    };

    if (! canShow) {
        return null;
    }

    return (
        <section
            aria-label="Round player order"
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]"
        >
            <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                            Player Order
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                            {isFirstRound ? 'Round 1 cutter' : `Round ${activeRoundNumber} player order`}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                            {isFirstRound
                                ? 'Choose who cuts in round 1. Dealer and first draw are assigned to the next sequential seats.'
                                : 'These are the players roles for this round.'}
                        </p>
                    </div>
                    <button
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? 'Expand player order' : 'Collapse player order'}
                        className="sm:hidden inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                        onClick={() => setCollapsed((prev) => !prev)}
                        type="button"
                    >
                        <svg
                            aria-hidden="true"
                            className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
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

            {!collapsed && (<div className="px-6 py-5">
                {cutterCandidates.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {cutterCandidates.map((player) => {
                            const currentRole = getCurrentRoundRoleForPlayer(player.id);
                            const isHighlightedPlayer = isFirstRound
                                ? currentRole === 'Cutter' || initialCutterPlayer?.id === player.id
                                : currentRole === 'Cutter';

                            return (
                                <button
                                    key={player.id}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                        currentRole
                                            ? ROLE_CHIP_COLORS[currentRole] ?? 'border-slate-200 bg-white text-slate-700'
                                            : isHighlightedPlayer
                                                ? ROLE_CHIP_COLORS.Cutter
                                                : 'border-indigo-200 bg-white text-indigo-700'
                                    } ${isFirstRound ? 'hover:border-blue-300 hover:bg-blue-200' : 'cursor-default opacity-80'}`}
                                    disabled={! isFirstRound}
                                    onClick={isFirstRound ? () => handleSetInitialCutter(player.id) : undefined}
                                    type="button"
                                >
                                    {player.seat_number != null
                                        ? `Seat ${player.seat_number} · ${player.display_name}`
                                        : player.display_name}
                                    {currentRole ? ` · ${currentRole}` : ''}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-indigo-700">
                        Add at least one player to assign the initial cutter.
                    </p>
                )}

                {isFirstRound && cutterError ? (
                    <p className="mt-2 text-sm text-red-600">{cutterError}</p>
                ) : null}
            </div>)}
        </section>
    );
}
