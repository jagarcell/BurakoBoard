import { useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Visual labels for each round role.
 *
 * @type {Record<string, string>}
 */
const ROLE_LABELS = {
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
    cutter: 'bg-blue-100 text-blue-700 border-blue-200',
    dealer: 'bg-amber-100 text-amber-700 border-amber-200',
    first_draw: 'bg-green-100 text-green-700 border-green-200',
};

/**
 * Build a map from player_id to role key for a given round's role assignment.
 *
 * @param {object|null} roundRoles - Round roles object with cutter/dealer/first_draw entries.
 * @return {Record<number, string>} Map of player_id → role key.
 * Logic: iterate over every known role key, extract the player_id from each
 * entry and store the reverse mapping so chips can look up their role in O(1).
 */
function buildRoleMap(roundRoles) {
    if (!roundRoles) return {};
    const map = {};
    for (const roleKey of ['cutter', 'dealer', 'first_draw']) {
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
 *   `{ round_number, cutter, dealer, first_draw }`.
 * @param {number|null} props.roundNumber - Round number shown in the centre of the circle.
 * @param {boolean}     [props.isOpen=true] - When true plays the genie-open animation;
 *   when false plays the genie-close animation so the caller can keep the element
 *   mounted until the collapse finishes before unmounting it.
 * @param {DOMRect|null} [props.buttonRect=null] - The bounding rect of the toggle
 *   button that opened the circle. When provided, `--genie-dx` and `--genie-dy`
 *   CSS custom properties are computed as the offset from the wrapper's centre to
 *   the button's centre so the genie animation visually originates from the button.
 * @return {JSX.Element}
 * Logic: sort seated players by seat number, compute an angular position for
 * each one (counter-clockwise, seat 1 at top-right), draw an SVG dashed ring,
 * then absolutely-position each chip at its computed (x, y) coordinate.
 * The outermost wrapper applies a CSS genie animation driven by `isOpen`.
 * A useLayoutEffect runs synchronously before paint to set --genie-dx/dy from
 * the measured offset between the button and the wrapper's centre, ensuring the
 * translate in the keyframes originates from the correct screen position.
 */
export default function PlayerCircle({ players, roundRoles, roundNumber, isOpen = true, buttonRect = null }) {
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

    const wrapperRef = useRef(null);

    /**
     * Compute the (dx, dy) pixel offset from the wrapper's centre to the
     * toggle button's centre and store it as CSS custom properties so the
     * genie keyframes can translate from the button position.
     *
     * @return {void}
     * Logic: runs synchronously after the DOM commit (useLayoutEffect) so the
     * CSS vars are applied before the browser paints the first animation frame.
     * Falls back to 0 when no buttonRect is available.
     */
    useLayoutEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        if (!buttonRect) {
            el.style.setProperty('--genie-dx', '0px');
            el.style.setProperty('--genie-dy', '0px');
            return;
        }
        const r = el.getBoundingClientRect();
        const bx = buttonRect.left + buttonRect.width / 2;
        const by = buttonRect.top + buttonRect.height / 2;
        const wx = r.left + r.width / 2;
        const wy = r.top + r.height / 2;
        el.style.setProperty('--genie-dx', `${bx - wx}px`);
        el.style.setProperty('--genie-dy', `${by - wy}px`);
    }, [buttonRect]);

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
        <div
            ref={wrapperRef}
            className={`flex flex-col items-center gap-3 px-5 pb-5 pt-4 ${isOpen ? 'animate-genie-open' : 'animate-genie-close'}`}
        >
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
                    <defs>
                        {/* Arrowhead marker pointing in the counter-clockwise direction */}
                        <marker
                            id="ccw-arrow"
                            markerHeight="6"
                            markerWidth="6"
                            orient="auto"
                            refX="0"
                            refY="3"
                            viewBox="0 0 6 6"
                        >
                            <path
                                d="M0,0 L6,3 L0,6 Z"
                                fill="rgba(99,102,241,0.45)"
                            />
                        </marker>
                    </defs>

                    <circle
                        cx={CENTER}
                        cy={CENTER}
                        fill="none"
                        r={RADIUS}
                        stroke="rgba(99,102,241,0.18)"
                        strokeDasharray="5 7"
                        strokeWidth="1.5"
                    />

                    {/*
                      * Two demi-circular counter-clockwise arrows drawn 20 px outside
                      * the centre badge (badge r=32 → arrow r=52).
                      * Each arc spans ~120°, leaving ~60° gaps on the left and right sides.
                      *
                      * SVG angle convention: 0°=right, 90°=down, 180°=left, 270°=up.
                      * sweep-flag=0 → counter-clockwise arc (as seen on screen, y-down).
                      *
                      * Arc 1 (top half, CCW): from 330° to 210° passing through 270° (top).
                      *   start (330°): cx+r·cos(330°)=185.0, cy+r·sin(330°)=114.0
                      *   end   (210°): cx+r·cos(210°)=95.0,  cy+r·sin(210°)=114.0
                      *   sweep-flag=0, large-arc-flag=0 → 120° CCW arc over the top
                      *
                      * Arc 2 (bottom half, CCW): from 150° to 30° passing through 90° (bottom).
                      *   start (150°): cx+r·cos(150°)=95.0,  cy+r·sin(150°)=166.0
                      *   end   (30°):  cx+r·cos(30°)=185.0,  cy+r·sin(30°)=166.0
                      *   sweep-flag=0, large-arc-flag=0 → 120° CCW arc over the bottom
                      */}
                    <path
                        d="M 185.0,114.0 A 52,52 0 0,0 95.0,114.0"
                        fill="none"
                        markerEnd="url(#ccw-arrow)"
                        stroke="rgba(99,102,241,0.45)"
                        strokeLinecap="butt"
                        strokeWidth="1.5"
                    />
                    <path
                        d="M 95.0,166.0 A 52,52 0 0,0 185.0,166.0"
                        fill="none"
                        markerEnd="url(#ccw-arrow)"
                        stroke="rgba(99,102,241,0.45)"
                        strokeLinecap="butt"
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
