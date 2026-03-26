/**
 * Build the default game name string used when creating a new game or rematch.
 * Format: "Wednesday 2026/03/26 14:05"
 *
 * @returns {string} Human-readable game name based on the current local time.
 */
export function formatDefaultGameName() {
    const now     = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const year    = now.getFullYear();
    const month   = String(now.getMonth() + 1).padStart(2, '0');
    const day     = String(now.getDate()).padStart(2, '0');
    const hours   = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${dayName} ${year}/${month}/${day} ${hours}:${minutes}`;
}
