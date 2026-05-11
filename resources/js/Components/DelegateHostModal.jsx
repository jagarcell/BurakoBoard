import api from '@/api/client';
import { useEffect, useState } from 'react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';

/**
 * Modal that lets the game creator delegate the host role to one of the game's viewers.
 *
 * @param {boolean}            props.isOpen     - Whether the modal is visible.
 * @param {function}           props.onClose    - Called to request the modal to close.
 * @param {number|null}        props.gameId     - ID of the game whose host role is being delegated.
 * @param {function}           props.onSuccess  - Called with the updated game object once the role is transferred.
 * @return {JSX.Element}
 *
 * Logic: Fetches all current viewers from GET /games/{gameId}/viewers when the modal opens.
 * The creator selects exactly one viewer via a radio-button list and confirms. The component
 * fires PUT /games/{gameId}/host with the selected user_id and calls onSuccess(updatedGame)
 * so the parent can immediately flip user_role to 'viewer' in its local state.
 */
export default function DelegateHostModal({ isOpen, onClose, gameId, onSuccess }) {
    const [viewers, setViewers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    /**
     * Fetch the viewer list for the current game.
     *
     * @return {Promise<void>}
     *
     * Logic: Calls GET /games/{gameId}/viewers and stores the returned array. Resets
     * selection and error state so the modal always opens in a clean state.
     */
    const fetchViewers = async () => {
        if (!gameId) return;

        setIsLoading(true);
        setLoadError('');
        setViewers([]);
        setSelectedUserId(null);

        try {
            const response = await api.get(`/games/${gameId}/viewers`);
            setViewers(response.data?.data?.viewers ?? []);
        } catch {
            setLoadError('Unable to load viewers right now. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Load viewers whenever the modal opens or the gameId changes while open.
    useEffect(() => {
        if (!isOpen || !gameId) return;

        setSubmitError('');
        fetchViewers();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchViewers is a stable local function; gameId and isOpen are the only triggers
    }, [isOpen, gameId]);

    /**
     * Submit the delegation request.
     *
     * @return {Promise<void>}
     *
     * Logic: PUT /games/{gameId}/host with the selected user_id. On success, pass the
     * updated game object to onSuccess and close the modal. On failure, display a
     * descriptive error from the server or a generic fallback.
     */
    const handleDelegate = async () => {
        if (!gameId || selectedUserId === null || isSubmitting) return;

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const response = await api.put(`/games/${gameId}/host`, { user_id: selectedUserId });
            const updatedGame = response.data?.data?.game;

            if (!updatedGame) {
                throw new Error('Game payload missing from response.');
            }

            onSuccess(updatedGame);
            onClose();
        } catch (error) {
            const apiError =
                error.response?.data?.data?.errors?.user_id?.[0] ??
                error.response?.data?.data?.message ??
                'Unable to delegate the host role right now. Please try again.';
            setSubmitError(apiError);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (isSubmitting) return;
        onClose();
    };

    return (
        <Modal maxWidth="lg" onClose={handleClose} show={isOpen}>
            <div className="space-y-4 p-6">
                <div className="space-y-1">
                    <h4 className="text-lg font-semibold text-slate-900">
                        Delegate Host Role
                    </h4>
                    <p className="text-sm text-slate-600">
                        Select a viewer to become the new host. Your role will change to viewer once confirmed.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <svg
                            aria-label="Loading viewers"
                            className="h-6 w-6 animate-spin text-amber-500"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="opacity-75"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                fill="currentColor"
                            />
                        </svg>
                    </div>
                ) : loadError !== '' ? (
                    <p className="py-4 text-center text-sm font-medium text-red-600">
                        {loadError}
                    </p>
                ) : viewers.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                        No viewers are following this game yet.
                    </p>
                ) : (
                    <ul
                        aria-label="Select a viewer to become host"
                        className="divide-y divide-slate-100 rounded-xl border border-slate-200"
                        role="radiogroup"
                    >
                        {viewers.map((viewer) => (
                            <li key={viewer.id}>
                                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                                    <input
                                        checked={selectedUserId === viewer.id}
                                        className="h-4 w-4 cursor-pointer accent-amber-500"
                                        id={`delegate-viewer-${viewer.id}`}
                                        name="delegate-viewer"
                                        onChange={() => setSelectedUserId(viewer.id)}
                                        type="radio"
                                        value={viewer.id}
                                    />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="text-sm font-medium text-slate-800">
                                            {viewer.name}
                                        </span>
                                        <span className="truncate text-xs text-slate-500">
                                            {viewer.email}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex justify-end gap-3 pt-1">
                    <SecondaryButton disabled={isSubmitting} onClick={handleClose} type="button">
                        Cancel
                    </SecondaryButton>
                    <PrimaryButton
                        className="bg-amber-500 hover:bg-amber-600 focus:ring-amber-400"
                        disabled={selectedUserId === null || isSubmitting}
                        onClick={handleDelegate}
                        type="button"
                    >
                        {isSubmitting ? 'Delegating…' : 'Confirm'}
                    </PrimaryButton>
                </div>

                {submitError !== '' && (
                    <p className="text-sm font-medium text-red-600">{submitError}</p>
                )}
            </div>
        </Modal>
    );
}
