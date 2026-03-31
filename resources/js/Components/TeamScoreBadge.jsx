/**
 * Displays a team's current score as a color-coded badge.
 *
 * @param {number}  props.score          - The team's score to display.
 * @param {string}  props.label          - Accessible aria-label for the span.
 * @param {boolean} [props.bothPositive] - True when both teams have positive scores (used for ranking colour).
 * @param {number|null} [props.opponentScore] - Opponent's score; used to decide the "behind" colour tier.
 * @return {JSX.Element}
 *
 * Logic: Derives a Tailwind colour class from the score value and, when both teams are
 * positive, whether this team trails the opponent. Renders a pill-shaped <span>.
 */
export default function TeamScoreBadge({ score, label, bothPositive = false, opponentScore = null }) {
    const cls =
        score < 0
            ? 'bg-red-100 text-red-800'
            : score === 0
                ? 'bg-[bisque] text-green-700'
                : bothPositive && opponentScore !== null && score < opponentScore
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800';

    return (
        <span
            aria-label={label}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
        >
            {score}
        </span>
    );
}
