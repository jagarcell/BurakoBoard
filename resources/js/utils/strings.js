/**
 * Trim leading/trailing whitespace and collapse inner whitespace runs to a single space.
 * e.g. '  Team  Alpha  ' → 'Team Alpha'
 *
 * @param {string} str - Raw input string.
 * @returns {string} Normalised string.
 */
export const normalizeName = (str) => str.trim().replace(/\s+/g, ' ');
