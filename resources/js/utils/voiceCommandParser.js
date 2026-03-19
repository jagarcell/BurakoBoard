/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @return {number} The minimum number of single-character edits needed to
 *   transform `a` into `b`.
 *
 * Logic: Iterative single-row DP. Avoids allocating an m×n matrix by re-using
 * a single n+1 row and tracking the previous diagonal value inline.
 */
function levenshtein(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const row = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val =
                a[i - 1] === b[j - 1]
                    ? row[j - 1]
                    : 1 + Math.min(row[j - 1], row[j], prev);
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }

    return row[b.length];
}

/**
 * Find the closest fuzzy match for `raw` among `candidates`.
 *
 * @param {string} raw - The raw token to match (will be lowercased internally).
 * @param {Array<{ id: number, label: string }>} candidates - Candidates to
 *   match against; each must have an `id` and a `label`.
 * @return {{ id: number, label: string } | null} Best match, or null when no
 *   candidate falls within the distance threshold.
 *
 * Logic: Normalises both strings to lowercase and computes Levenshtein
 * distance. Exact matches are returned immediately. Otherwise the threshold is
 * max(2, floor(candidate_length × 0.35)) so short words (≤5 chars) allow up
 * to 2 edits and longer words scale proportionally. When multiple candidates
 * share the minimum distance the one appearing first in `candidates` wins.
 */
function fuzzyMatch(raw, candidates) {
    const normalised = raw.toLowerCase().trim();
    let best = null;
    let bestDist = Infinity;

    for (const candidate of candidates) {
        const label = candidate.label.toLowerCase();

        if (label === normalised) return candidate;

        const dist = levenshtein(normalised, label);
        const threshold = Math.max(2, Math.floor(label.length * 0.35));

        if (dist <= threshold && dist < bestDist) {
            best = candidate;
            bestDist = dist;
        }
    }

    return best;
}

/** Maps spoken word-numbers to their integer values. */
const WORD_NUMBERS = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Phrases that map to the save-round action (checked before the main regex). */
const SAVE_PHRASES = ['save round', 'record round', 'save', 'submit round', 'submit'];

/**
 * Apply user-defined voice aliases to a raw transcript as a pre-processing step.
 *
 * @param {string} transcript - The raw transcript string from SpeechRecognition.
 * @param {Array<{ alias: string, keyword: string }>} aliases - The authenticated
 *   user's alias list, where each `alias` is the misheard word and `keyword` is
 *   the intended replacement.
 * @return {string} The transcript with all alias occurrences replaced by their
 *   corresponding keywords.
 *
 * Logic:
 *   Aliases are sorted by descending length before processing so multi-word
 *   phrases (e.g. "new york") are matched before any shorter single-word alias
 *   that might be a substring of them. Each alias is replaced using a
 *   case-insensitive word-boundary regex so partial word matches are avoided
 *   (e.g. "Moroccan" is not replaced when the alias is "Morocco").
 */
export function applyAliases(transcript, aliases) {
    if (!aliases || aliases.length === 0) return transcript;

    let result = transcript;
    const sorted = [...aliases].sort((a, b) => b.alias.length - a.alias.length);

    for (const { alias, keyword } of sorted) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(re, keyword);
    }

    return result;
}

/**
 * Regex that captures:
 *   Group 1 — action word (add / set / remove / minus / subtract / zero / clear / reset)
 *   Group 2 — optional quantity (word number or digit string)
 *   Group 3 — element raw token (everything before the preposition)
 *   Group 4 — team raw token (everything after the preposition)
 */
const COMMAND_RE =
    /^(add|set|remove|minus|subtract|zero|clear|reset)\s+(?:(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(.+?)\s+(?:to|for|from)\s+(.+)$/i;

/** Normalises verb synonyms to canonical action tokens. */
const ACTION_MAP = {
    add: 'add',
    set: 'set',
    remove: 'remove',
    minus: 'remove',
    subtract: 'remove',
    zero: 'zero',
    clear: 'zero',
    reset: 'zero',
};

/**
 * Parse a raw speech transcript into a structured voice command.
 *
 * @param {string} transcript - Raw transcript string returned by SpeechRecognition.
 * @param {Array<{ id: number, label: string, input_type: string }>} elements -
 *   BaseElement catalogue from the API.
 * @param {Array<{ id: number, name: string }>} teams - Teams in the current game.
 * @param {Array<{ alias: string, keyword: string }>} [aliases=[]] - The authenticated
 *   user's voice aliases; applied as a pre-processing substitution step before parsing.
 * @return {{ type: 'element', action: string, elementId: number, teamId: number, quantity: number }
 *          | { type: 'save' }
 *          | { type: 'unknown', reason: string }}
 *
 * Logic:
 *   1. Apply user aliases to the raw transcript (word-boundary substitution).
 *   2. Trim and lowercase the result.
 *   3. Check against SAVE_PHRASES for a quick save-round match.
 *   4. Apply COMMAND_RE to extract action, optional quantity, element token, and team token.
 *   5. Fuzzy-match the element token against element labels; reject if no match.
 *   6. Fuzzy-match the team token against team names; reject if no match.
 *   7. Return a typed command object the caller can dispatch against component state.
 */
export function parseVoiceCommand(transcript, elements, teams, aliases = []) {
    const raw = applyAliases(transcript.trim(), aliases).toLowerCase();

    if (SAVE_PHRASES.some((p) => raw === p || raw.startsWith(p + ' '))) {
        return { type: 'save' };
    }

    const match = raw.match(COMMAND_RE);
    if (!match) {
        return { type: 'unknown', reason: 'Command not understood. Try "Add Dirty Canastra to [Team]".' };
    }

    const [, actionRaw, quantityRaw, elementRaw, teamRaw] = match;

    const action = ACTION_MAP[actionRaw.toLowerCase()] ?? 'add';
    const quantity = quantityRaw
        ? (WORD_NUMBERS[quantityRaw.toLowerCase()] ?? parseInt(quantityRaw, 10) ?? 1)
        : 1;

    const elementCandidates = elements.map((el) => ({ id: el.id, label: el.label }));
    const matchedElement = fuzzyMatch(elementRaw, elementCandidates);
    if (!matchedElement) {
        return { type: 'unknown', reason: `Element "${elementRaw}" not recognised.` };
    }

    const teamCandidates = teams.map((t) => ({ id: t.id, label: t.name }));
    const matchedTeam = fuzzyMatch(teamRaw, teamCandidates);
    if (!matchedTeam) {
        return { type: 'unknown', reason: `Team "${teamRaw}" not recognised.` };
    }

    return {
        type: 'element',
        action,
        elementId: matchedElement.id,
        teamId: matchedTeam.id,
        quantity,
    };
}
