export default function ApplicationLogo(props) {
    return (
        <svg
            {...props}
            viewBox="0 0 228 190"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <filter id="card-shadow" x="-15%" y="-15%" width="130%" height="130%">
                    <feDropShadow dx="1.5" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.22" />
                </filter>
            </defs>

            {/* A♠ — far left, rotated -30° */}
            <g transform="translate(42,114) rotate(-30)" filter="url(#card-shadow)">
                <rect x="-24" y="-34" width="48" height="68" rx="3.5" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                <text x="-17" y="-19" fontFamily="Georgia, serif" fontSize="11" fontWeight="bold" fill="#111827">A</text>
                <text x="-17" y="-8" fontFamily="Georgia, serif" fontSize="9" fill="#111827">♠</text>
                <text x="0" y="9" fontFamily="Georgia, serif" fontSize="22" fill="#111827" textAnchor="middle" dominantBaseline="middle">♠</text>
            </g>

            {/* K♥ — left, rotated -15° */}
            <g transform="translate(77,100) rotate(-15)" filter="url(#card-shadow)">
                <rect x="-24" y="-34" width="48" height="68" rx="3.5" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                <text x="-17" y="-19" fontFamily="Georgia, serif" fontSize="11" fontWeight="bold" fill="#DC2626">K</text>
                <text x="-17" y="-8" fontFamily="Georgia, serif" fontSize="9" fill="#DC2626">♥</text>
                <text x="0" y="9" fontFamily="Georgia, serif" fontSize="22" fill="#DC2626" textAnchor="middle" dominantBaseline="middle">♥</text>
            </g>

            {/* J♣ — center, upright */}
            <g transform="translate(114,95) rotate(0)" filter="url(#card-shadow)">
                <rect x="-24" y="-34" width="48" height="68" rx="3.5" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                <text x="-17" y="-19" fontFamily="Georgia, serif" fontSize="11" fontWeight="bold" fill="#111827">J</text>
                <text x="-17" y="-8" fontFamily="Georgia, serif" fontSize="9" fill="#111827">♣</text>
                <text x="0" y="9" fontFamily="Georgia, serif" fontSize="22" fill="#111827" textAnchor="middle" dominantBaseline="middle">♣</text>
            </g>

            {/* Q♦ — right, rotated +15° */}
            <g transform="translate(151,100) rotate(15)" filter="url(#card-shadow)">
                <rect x="-24" y="-34" width="48" height="68" rx="3.5" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                <text x="-17" y="-19" fontFamily="Georgia, serif" fontSize="11" fontWeight="bold" fill="#DC2626">Q</text>
                <text x="-17" y="-8" fontFamily="Georgia, serif" fontSize="9" fill="#DC2626">♦</text>
                <text x="0" y="9" fontFamily="Georgia, serif" fontSize="22" fill="#DC2626" textAnchor="middle" dominantBaseline="middle">♦</text>
            </g>

            {/* 10♠ — far right, rotated +30° */}
            <g transform="translate(186,114) rotate(30)" filter="url(#card-shadow)">
                <rect x="-24" y="-34" width="48" height="68" rx="3.5" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                <text x="-17" y="-19" fontFamily="Georgia, serif" fontSize="9" fontWeight="bold" fill="#111827">10</text>
                <text x="-17" y="-8" fontFamily="Georgia, serif" fontSize="9" fill="#111827">♠</text>
                <text x="0" y="9" fontFamily="Georgia, serif" fontSize="22" fill="#111827" textAnchor="middle" dominantBaseline="middle">♠</text>
            </g>
        </svg>
    );
}
