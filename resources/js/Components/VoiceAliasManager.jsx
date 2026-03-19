import { useState } from 'react';

/**
 * A single row in the alias list showing a misheard → keyword mapping.
 *
 * @param {{ alias: string, keyword: string, onDelete: () => void, isDeleting: boolean }} props
 */
function AliasRow({ alias, keyword, onDelete, isDeleting }) {
    return (
        <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-rose-600">{alias}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-indigo-600">{keyword}</span>
            </span>
            <button
                aria-label={`Remove alias: ${alias} → ${keyword}`}
                className="flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                disabled={isDeleting}
                onClick={onDelete}
                type="button"
            >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </li>
    );
}

/**
 * A compact inline panel that lets the authenticated user manage their personal
 * voice recognition aliases — misheard word → intended keyword mappings.
 *
 * @param {{
 *   aliases: Array<{ id: number, alias: string, keyword: string }>,
 *   isLoading: boolean,
 *   error: string | null,
 *   misheardOptions: string[],
 *   onAdd: (alias: string, keyword: string) => Promise<void>,
 *   onRemove: (aliasId: number) => Promise<void>,
 * }} props
 *
 * Logic:
 *   - Renders an add-form at the top with a misheard word field (select when
 *     misheardOptions are available, text input otherwise), an intended word input,
 *     and an inline Submit button. Client-side validation requires both fields.
 *   - When misheardOptions is non-empty (populated after a mic listening session),
 *     the misheard field is rendered as a <select> whose options are the unique
 *     lowercased words returned by the browser's speech recognition alternatives.
 *   - On submit, calls onAdd and clears the form on success, or shows an inline
 *     error message from the server (e.g. "You already have an alias for that word.").
 *   - Each existing alias is shown as an AliasRow with an optimistic delete button.
 *   - Tracks which alias is being deleted to show a disabled state on that row.
 */
export default function VoiceAliasManager({ aliases = [], isLoading, error, misheardOptions = [], onAdd, onRemove }) {
    const [misheard, setMisheard] = useState('');
    const [intended, setIntended] = useState('');
    const [addError, setAddError] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const handleAdd = async (e) => {
        e.preventDefault();
        const trimmedMisheard = misheard.trim();
        const trimmedIntended = intended.trim();

        if (!trimmedMisheard || !trimmedIntended) {
            setAddError('Both fields are required.');
            return;
        }

        setAddError('');
        setIsAdding(true);
        try {
            await onAdd(trimmedMisheard, trimmedIntended);
            setMisheard('');
            setIntended('');
        } catch (err) {
            const msg =
                err?.response?.data?.errors?.alias?.[0] ??
                err?.response?.data?.message ??
                'Failed to add alias.';
            setAddError(msg);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemove = async (aliasId) => {
        setDeletingId(aliasId);
        try {
            await onRemove(aliasId);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Voice Aliases
            </h3>

            {/* Add form */}
            <form className="mb-3 flex flex-col gap-2" onSubmit={handleAdd}>
                <div className="flex flex-col gap-2 sm:flex-row">
                    {misheardOptions.length > 0 ? (
                        <select
                            aria-label="Misheard word"
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            disabled={isAdding}
                            onChange={(e) => setMisheard(e.target.value)}
                            value={misheard}
                        >
                            <option value="">— pick misheard word —</option>
                            {misheardOptions.map((word) => (
                                <option key={word} value={word}>{word}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            aria-label="Misheard word"
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            disabled={isAdding}
                            onChange={(e) => setMisheard(e.target.value)}
                            placeholder="Misheard (e.g. Morocco)"
                            type="text"
                            value={misheard}
                        />
                    )}
                    <input
                        aria-label="Intended word"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        disabled={isAdding}
                        onChange={(e) => setIntended(e.target.value)}
                        placeholder="Intended (e.g. Burako)"
                        type="text"
                        value={intended}
                    />
                    <button
                        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 sm:flex-shrink-0"
                        disabled={isAdding}
                        type="submit"
                    >
                        {isAdding ? 'Adding…' : 'Add'}
                    </button>
                </div>
                {addError && (
                    <p className="text-xs text-rose-600" role="alert">{addError}</p>
                )}
            </form>

            {/* Alias list */}
            {isLoading ? (
                <p className="text-xs text-slate-400">Loading aliases…</p>
            ) : error ? (
                <p className="text-xs text-rose-600" role="alert">{error}</p>
            ) : aliases.length === 0 ? (
                <p className="text-xs text-slate-400">
                    No aliases yet. Add one above to train voice recognition.
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5" role="list">
                    {aliases.map((a) => (
                        <AliasRow
                            key={a.id}
                            alias={a.alias}
                            isDeleting={deletingId === a.id}
                            keyword={a.keyword}
                            onDelete={() => handleRemove(a.id)}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
