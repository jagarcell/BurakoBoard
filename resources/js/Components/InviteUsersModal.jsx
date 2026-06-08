import api from '@/api/client';
import { useEffect, useState } from 'react';
import Checkbox from '@/Components/Checkbox';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';

/**
 * Self-contained modal for inviting registered users as viewers of a game.
 *
 * @param {boolean}      props.isOpen  - Whether the modal is visible.
 * @param {function}     props.onClose - Called to request the modal to close.
 * @param {number|null}  props.gameId  - ID of the game to invite users to; triggers user fetch on open.
 * @return {JSX.Element}
 *
 * Logic: Fetches the paginated list of invitable users from
 * GET /games/{gameId}/invitable-users when the modal opens (or when the game changes
 * while open). Allows multi-select via checkboxes and sends a single batched
 * POST /games/{gameId}/invitations with all selected user IDs. Refreshes the user
 * list after sending to remove the newly-invited users from the results.
 */
export default function InviteUsersModal({ isOpen, onClose, gameId }) {
    const [inviteUsers, setInviteUsers] = useState([]);
    const [inviteMeta, setInviteMeta] = useState({ current_page: 1, last_page: 1 });
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectedEmails, setSelectedEmails] = useState(new Set());
    const [emailInput, setEmailInput] = useState('');
    const [emailInvites, setEmailInvites] = useState([]);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendSuccess, setSendSuccess] = useState('');

    /**
     * Fetch a page of invitable users for the current game.
     *
     * @param {number} page - 1-based page index to fetch.
     * @return {Promise<void>}
     *
     * Logic: Calls GET /games/{gameId}/invitable-users?page={page} and overwrites the
     * displayed user list and pagination metadata. Silently replaces the list on page
     * changes so previously selected IDs are preserved across pages.
     */
    const fetchUsers = async (page) => {
        if (!gameId) return;

        setIsLoading(true);
        setLoadError('');

        try {
            const response = await api.get(`/games/${gameId}/invitable-users`, {
                params: { page },
            });
            const payload = response.data?.data?.users ?? {};

            setInviteUsers(payload.data ?? []);
            setInviteMeta({
                current_page: payload.meta?.current_page ?? 1,
                last_page: payload.meta?.last_page ?? 1,
            });
        } catch {
            setLoadError('Unable to load users right now.');
        } finally {
            setIsLoading(false);
        }
    };

    // Load page 1 whenever the modal opens or the gameId changes while open.
    useEffect(() => {
        if (!isOpen || !gameId) return;

        setSelectedIds(new Set());
        setInviteUsers([]);
        setInviteMeta({ current_page: 1, last_page: 1 });
        setSendError('');
        setSendSuccess('');
        fetchUsers(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUsers is a stable local function; gameId and isOpen are the only triggers
    }, [isOpen, gameId]);

    /**
     * Toggles userId selection in the invite set.
     *
     * @param {number} userId
     * @return {void}
     *
     * Logic: Creates a new Set from the current selection, toggles the given ID, and
     * replaces the state reference.
     */
    const toggleUser = (userId) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    /**
     * Sends invitations for all currently selected user IDs.
     *
     * @return {Promise<void>}
     *
     * Logic: Posts { user_ids: [...selectedIds] } to POST /games/{gameId}/invitations.
     * On success, shows the server-reported invite count, clears selected IDs, and
     * refreshes page 1 to remove newly-invited users from the list.
     */
    const toggleEmail = (email) => {
        setSelectedEmails((current) => {
            const next = new Set(current);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const isValidEmail = (value) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    };

    const addEmailInvite = () => {
        const email = emailInput.trim();
        if (!isValidEmail(email)) return;

        if (!emailInvites.includes(email)) {
            setEmailInvites((cur) => [email, ...cur]);
            setSelectedEmails((cur) => {
                const next = new Set(cur);
                next.add(email);
                return next;
            });
        }

        setEmailInput('');
    };

    const handleSend = async () => {
        if (!gameId || (selectedIds.size === 0 && selectedEmails.size === 0) || isSending) return;

        setIsSending(true);
        setSendError('');
        setSendSuccess('');

        try {
            const response = await api.post(
                `/games/${gameId}/invitations`,
                { user_ids: Array.from(selectedIds), emails: Array.from(selectedEmails) },
            );
            const count = response.data?.data?.invited_count ?? 0;

            setSendSuccess(
                count === 0
                    ? 'All selected users are already invited or members of this game.'
                    : `${count} invitation${count === 1 ? '' : 's'} sent successfully.`,
            );
            setSelectedIds(new Set());
            setSelectedEmails(new Set());
            setEmailInvites([]);
            fetchUsers(1);
        } catch {
            setSendError('Unable to send invitations right now. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleClose = () => {
        if (isSending) return;
        onClose();
    };

    return (
        <Modal maxWidth="lg" onClose={handleClose} show={isOpen}>
            <div className="space-y-4 p-6">
                <div className="space-y-1">
                    <h4 className="text-lg font-semibold text-slate-900">
                        Invite a Viewer
                    </h4>
                    <p className="text-sm text-slate-600">
                        Select the users you want to invite as viewers to this game.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <svg
                            aria-label="Loading users"
                            className="h-6 w-6 animate-spin text-indigo-500"
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
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <input
                                aria-label="Invite by email"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                placeholder="enter an email address"
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                            />
                            <button
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                                onClick={addEmailInvite}
                                disabled={!isValidEmail(emailInput)}
                                type="button"
                                aria-label="Add email invite"
                            >
                                +
                            </button>
                        </div>

                        {inviteUsers.length === 0 && emailInvites.length === 0 ? (
                            <p className="py-4 text-center text-sm text-slate-500">No users available to invite.</p>
                        ) : (
                            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" role="list">
                                {emailInvites.map((email) => (
                                    <li key={`email-${email}`}>
                                        <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                                            <Checkbox
                                                checked={selectedEmails.has(email)}
                                                id={`invite-email-${email}`}
                                                onChange={() => toggleEmail(email)}
                                            />
                                            <span className="text-sm text-slate-800">{email}</span>
                                        </label>
                                    </li>
                                ))}

                                {inviteUsers.map((user) => (
                                    <li key={user.id}>
                                        <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                                            <Checkbox
                                                checked={selectedIds.has(user.id)}
                                                id={`invite-user-${user.id}`}
                                                onChange={() => toggleUser(user.id)}
                                            />
                                            <span className="text-sm text-slate-800">
                                                {user.name}
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {!isLoading && inviteUsers.length > 0 && inviteMeta.last_page > 1 && (
                    <div className="flex items-center justify-between pt-1">
                        <button
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={inviteMeta.current_page <= 1}
                            onClick={() => fetchUsers(inviteMeta.current_page - 1)}
                            type="button"
                        >
                            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Prev
                        </button>

                        <span className="text-xs text-slate-500">
                            Page {inviteMeta.current_page} of {inviteMeta.last_page}
                        </span>

                        <button
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={inviteMeta.current_page >= inviteMeta.last_page}
                            onClick={() => fetchUsers(inviteMeta.current_page + 1)}
                            type="button"
                        >
                            Next
                            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-1">
                    <SecondaryButton disabled={isSending} onClick={handleClose} type="button">
                        Close
                    </SecondaryButton>
                    <PrimaryButton
                        disabled={(selectedIds.size === 0 && selectedEmails.size === 0) || isSending}
                        onClick={handleSend}
                        type="button"
                    >
                        {isSending ? 'Sending…' : 'Send'}
                    </PrimaryButton>
                </div>

                {sendError !== '' && (
                    <p className="text-sm font-medium text-red-600">{sendError}</p>
                )}

                {sendSuccess !== '' && (
                    <p className="text-sm font-medium text-emerald-600">{sendSuccess}</p>
                )}
            </div>
        </Modal>
    );
}
