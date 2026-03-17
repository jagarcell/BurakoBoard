import { useMemo } from 'react';

/**
 * Visual labels for each round role.
 *
 * @type {Record<string, string>}
 */
const ROLE_LABELS = {
    shuffler: 'Shuffler',
    cutter: 'Cutter',
    dealer: 'Dealer',
    first_draw: 'First Draw',
};

/**
 * Tailwind colour classes for each round role badge.
 *
 * @type {Record<string, string>}
 */
const ROLE_COLORS = {
    shuffler: 'bg-violet-100 text-violet-700 border-violet-200',
    cutter: 'bg-amber-100 text-amber-700 border-amber-200',
    dealer: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    first_draw: 'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * Build a map from player_id to role key for a given round's role assignment.
 *
 * @param {object|null} roundRoles - Round roles object with shuffler/cutter/dealer/first_draw entries.
 * @return {Record<number, string>} Map of player_id → role key.
 * Logic: iterate over every known role key, extract the player_id from each
 * entry and store the reverse mapping so chips can look up their role in O(1).
 */
function buildRoleMap(roundRoles) {
    if (!roundRoles) return {};
    const map = {};
    for (const roleKey of ['shuffler', 'cutter', 'dealer', 'first_draw']) {
        const entry = roundRoles[roleKey];
        if (entry?.player_id != null) {
            map[entry.player_id] = roleKey;
        }
    }
    return map;
}

/**
 * Circular seating chart showing player chips arranged counter-clockwise by seat number.
 *
 * Seat 1 is always placed at the top-right (45° clockwise from 12 o'clock).
 * Each subsequent seat rotates one step counter-clockwise.
 * Each chip shows the player's name, seat number, and their role for the round.
 *
 * @param {object}      props
 * @param {Array<{id: number, display_name: string, seat_number: number|null}>} props.players
 *   All players with assigned seat numbers from both teams.
 * @param {object|null} props.roundRoles
 *   Role assignment for the round being displayed:
 *   `{ round_number, shuffler, cutter, dealer, first_draw }`.
 * @param {number|null} props.roundNumber - Round number shown in the centre of the circle.
 * @param {boolean}     [props.isOpen=true] - When true plays the genie-open animation;
 *   when false plays the genie-close animation so the caller can keep the element
 *   mounted until the collapse finishes before unmounting it.
 * @return {JSX.Element}
 * Logic: sort seated players by seat number, compute an angular position for
 * each one (counter-clockwise, seat 1 at top-right), draw an SVG dashed ring,
 * then absolutely-position each chip at its computed (x, y) coordinate.
 * The outermost wrapper applies a CSS genie animation driven by `isOpen` —
 * stretching out from the top-center origin on open and squishing back on close.
 */
export default function PlayerCircle({ players, roundRoles, roundNumber, isOpen = true }) {
    const SIZE = 280;
    const CENTER = SIZE / 2;
    const RADIUS = 98;

    const seatedPlayers = useMemo(
        () =>
            [...players]
                .filter((p) => p.seat_number != null)
                .sort((a, b) => a.seat_number - b.seat_number),
        [players],
    );

    const roleMap = useMemo(() => buildRoleMap(roundRoles), [roundRoles]);

    /**
     * Compute the (x, y) position and role for every seated player.
     *
     * @return {Array<{id, display_name, seat_number, x, y, role}>}
     * Logic: map each player to polar coordinates where seat 1 anchors at 45°
     * clockwise from the top and each step subtracts 360/N degrees
     * (counter-clockwise rotation in screen space).
     */
    const positioned = useMemo(() => {
        const N = seatedPlayers.length;
        if (N === 0) return [];
        return seatedPlayers.map((player, i) => {
            const angleDeg = 45 - i * (360 / N);
            const angleRad = (angleDeg * Math.PI) / 180;
            const x = CENTER + RADIUS * Math.sin(angleRad);
            const y = CENTER - RADIUS * Math.cos(angleRad);
            return { ...player, x, y, role: roleMap[player.id] ?? null };
        });
    }, [seatedPlayers, roleMap]);

    return (
        <div className={`flex flex-col items-center gap-3 px-5 pb-5 pt-4 ${isOpen ? 'animate-genie-open' : 'animate-genie-close'}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">
                Round {roundNumber ?? '—'} — Seating &amp; Roles
            </p>

            <div
                className="relative shrink-0"
                style={{ width: SIZE, height: SIZE }}
            >
                {/* Dashed ring */}
                <svg
                    aria-hidden="true"
                    className="absolute inset-0"
                    height={SIZE}
                    viewBox={`0 0 ${SIZE} ${SIZE}`}
                    width={SIZE}
                >
                    <circle
                        cx={CENTER}
                        cy={CENTER}
                        fill="none"
                        r={RADIUS}
                        stroke="rgba(99,102,241,0.18)"
                        strokeDasharray="5 7"
                        strokeWidth="1.5"
                    />
                </svg>

                {/* Centre badge */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 shadow-sm">
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-indigo-300">
                            Round
                        </span>
                        <span className="text-xl font-bold leading-tight text-indigo-600">
                            {roundNumber ?? '—'}
                        </span>
                    </div>
                </div>

                {/* Player chips */}
                {positioned.map((player) => (
                    <div
                        key={player.id}
                        className="absolute flex flex-col items-center gap-0.5"
                        style={{
                            left: player.x,
                            top: player.y,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        {/* Name + seat chip */}
                        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm">
                            <span className="text-[10px] font-bold leading-none text-indigo-500">
                                #{player.seat_number}
                            </span>
                            <span className="max-w-[78px] truncate text-xs font-medium leading-none text-slate-700">
                                {player.display_name}
                            </span>
                        </div>

                        {/* Role badge */}
                        {player.role && (
                            <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${ROLE_COLORS[player.role]}`}
                            >
                                {ROLE_LABELS[player.role]}
                            </span>
                        )}
                    </div>
                ))}

                {seatedPlayers.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-xs text-slate-400">No seated players</p>
                    </div>
                )}
            </div>
        </div>
    );
}
