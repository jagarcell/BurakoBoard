/**
 * CardSpinner — animated in-progress UI component.
 *
 * Displays five SVG playing cards arranged in a circle that orbit the centre
 * of the SVG, providing a visually distinctive loading animation consistent
 * with the BurakoBoard card-game theme.
 *
 * @param {string} [message='Recording…'] - Label displayed below the spinner.
 *                                          Pass an empty string or null to hide it.
 * @param {string} [className='']         - Additional CSS classes applied to the
 *                                          outermost wrapper element.
 * @return {JSX.Element}
 *
 * Logic: Five mini playing-card shapes (A♠ K♥ J♣ Q♦ 10♠) are placed around a
 *        circle at 72° intervals, each card being translated to its orbit
 *        position and then individually rotated so it faces outward from the
 *        centre.  A single outer <g> wraps all five cards and receives the
 *        CSS class `animate-card-orbit`, which rotates the group around the
 *        SVG viewport centre (100, 100) via the @keyframes defined in app.css.
 *        A static drop-shadow filter (id="cs-shadow") adds depth.  The entire
 *        component is wrapped in a <div role="status"> so screen readers
 *        announce it as a live status region.
 */
export default function CardSpinner({ message = 'Recording…', className = '' }) {
    /**
     * Ordered list of cards to render around the orbit circle.
     * @type {{ value: string, suit: string, color: string }[]}
     */
    const cards = [
        { value: 'A',  suit: '♠', color: '#111827' },
        { value: 'K',  suit: '♥', color: '#DC2626' },
        { value: 'J',  suit: '♣', color: '#111827' },
        { value: 'Q',  suit: '♦', color: '#DC2626' },
        { value: '10', suit: '♠', color: '#111827' },
    ];

    const ORBIT_RADIUS = 52;
    const SVG_CX      = 100;
    const SVG_CY      = 100;

    /**
     * Compute the SVG translate+rotate transform string for card at position k.
     *
     * @param {number} index - Zero-based card index (0–4).
     * @return {string} SVG transform attribute value.
     *
     * Logic: Cards start at the top (−90° offset) and are spaced 72° apart.
     *        The card rect is drawn centred at the origin (x=−13, y=−19), then
     *        translated to the orbit position and rotated to face outward so
     *        each card's top points away from the circle's centre.
     */
    const cardTransform = (index) => {
        const angleDeg = index * 72 - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = SVG_CX + ORBIT_RADIUS * Math.cos(angleRad);
        const y = SVG_CY + ORBIT_RADIUS * Math.sin(angleRad);
        const rotation = index * 72;
        return `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${rotation})`;
    };

    return (
        <div
            aria-label={message || 'Loading'}
            aria-live="polite"
            className={`flex flex-col items-center gap-3 ${className}`}
            role="status"
        >
            <svg
                aria-hidden="true"
                className="h-32 w-32"
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Drop shadow shared by all five cards */}
                    <filter
                        height="150%"
                        id="cs-shadow"
                        width="150%"
                        x="-25%"
                        y="-25%"
                    >
                        <feDropShadow
                            dx="1"
                            dy="1.5"
                            floodColor="#000"
                            floodOpacity="0.20"
                            stdDeviation="1.5"
                        />
                    </filter>
                </defs>

                {/*
                  * Orbiting card group — rotated by animate-card-orbit around
                  * the SVG viewport centre (100, 100).
                  */}
                <g className="animate-card-orbit">
                    {cards.map(({ value, suit, color }, index) => (
                        <g
                            filter="url(#cs-shadow)"
                            key={index}
                            transform={cardTransform(index)}
                        >
                            {/* Card body */}
                            <rect
                                fill="white"
                                height="38"
                                rx="2.5"
                                stroke="#D1D5DB"
                                strokeWidth="0.75"
                                width="26"
                                x="-13"
                                y="-19"
                            />

                            {/* Top-left rank */}
                            <text
                                fill={color}
                                fontFamily="Georgia, serif"
                                fontSize="7"
                                fontWeight="bold"
                                x="-9"
                                y="-8"
                            >
                                {value}
                            </text>

                            {/* Top-left suit pip */}
                            <text
                                fill={color}
                                fontFamily="Georgia, serif"
                                fontSize="6"
                                x="-9"
                                y="-1"
                            >
                                {suit}
                            </text>

                            {/* Centre suit pip */}
                            <text
                                dominantBaseline="middle"
                                fill={color}
                                fontFamily="Georgia, serif"
                                fontSize="14"
                                textAnchor="middle"
                                x="0"
                                y="11"
                            >
                                {suit}
                            </text>
                        </g>
                    ))}
                </g>
            </svg>

            {message && (
                <p className="text-sm font-medium text-slate-600">{message}</p>
            )}
        </div>
    );
}
