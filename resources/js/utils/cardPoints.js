/**
 * cardPoints.js
 *
 * Fetches the authoritative card-rank-to-points mapping from the backend API
 * (GET /api/v1/card-weights) once per page load and caches it in module scope.
 * Exposes a single helper — sumCardPoints — that converts an array of detected
 * rank strings into a total point value.
 *
 * The module-level cache means every call to sumCardPoints (and the first call
 * to getCardWeightsMap) within the same browser session shares a single fetch,
 * avoiding redundant requests when the scanner is opened multiple times.
 */

/** @type {Promise<Map<string, number>>|null} */
let weightsPromise = null;

/**
 * Fetch and cache the rank→points map from the API.
 *
 * @returns {Promise<Map<string, number>>} Resolves to a Map keyed by rank string (e.g. 'A', '10', 'joker').
 * Logic: On first call an Axios request is fired and the result is transformed into a Map; the
 * Promise itself is cached so concurrent callers await the same request rather than issuing
 * duplicate fetches. Subsequent calls return the already-resolved Promise instantly.
 */
export async function getCardWeightsMap() {
    if (!weightsPromise) {
        weightsPromise = fetch('/api/v1/card-weights')
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Failed to fetch card weights: ${res.status}`);
                }
                return res.json();
            })
            .then(({ data: { card_weights } }) => {
                const map = new Map();
                for (const { rank, points } of card_weights) {
                    map.set(rank, points);
                }
                return map;
            })
            .catch((err) => {
                // Reset so a subsequent call can retry after a transient failure.
                weightsPromise = null;
                throw err;
            });
    }
    return weightsPromise;
}

/**
 * Sum the point values for an array of detected card rank strings.
 *
 * @param {string[]} ranks     - Array of rank strings as returned by OCR (e.g. ['A', '7', 'K', 'joker']).
 * @param {Map<string, number>} weightsMap - The rank→points map returned by getCardWeightsMap().
 * @returns {number} Total points for all recognised ranks; unrecognised ranks contribute 0.
 * Logic: Iterates the ranks array, looks each entry up in the provided map, and accumulates.
 * Unknown/unrecognised ranks silently contribute 0 so a partial OCR result degrades gracefully.
 */
export function sumCardPoints(ranks, weightsMap) {
    return ranks.reduce((total, rank) => total + (weightsMap.get(rank) ?? 0), 0);
}

/**
 * Convenience wrapper: fetch the map and sum in one call.
 *
 * @param {string[]} ranks - Array of detected rank strings.
 * @returns {Promise<number>} Resolves to the total point value.
 * Logic: Delegates to getCardWeightsMap then sumCardPoints so callers that want
 * a one-liner don't have to manage the map separately.
 */
export async function sumCardPointsAsync(ranks) {
    const map = await getCardWeightsMap();
    return sumCardPoints(ranks, map);
}
