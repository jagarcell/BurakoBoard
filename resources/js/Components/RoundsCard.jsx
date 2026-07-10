import api from '@/api/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import BaseElementsInput from '@/Components/BaseElementsInput';
import CardSpinner from '@/Components/CardSpinner';
import RoundHistoryTable from '@/Components/RoundHistoryTable';
import ViewerRoundPanel from '@/Components/ViewerRoundPanel';
import VoiceAliasManager from '@/Components/VoiceAliasManager';
import VoiceMicButton from '@/Components/VoiceMicButton';
import useVoiceAliases from '@/hooks/useVoiceAliases';
import useVoiceCommands from '@/hooks/useVoiceCommands';
import useVisibilityRefresh from '@/hooks/useVisibilityRefresh';
import useEchoReconnect from '@/hooks/useEchoReconnect';

/** Human-readable labels for each round role key, used in the player order reference strip. */
const PLAYER_ROLE_LABEL_MAP = {
    cutter: 'Cutter',
    dealer: 'Dealer',
    first_draw: 'First Draw',
};
import InputError from '@/Components/InputError';
import PlayerCircle from '@/Components/PlayerCircle';
import PrimaryButton from '@/Components/PrimaryButton';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import useWinnerSound from '@/hooks/useWinnerSound';

export default function RoundsCard({ selectedGame, initialTeams = [], initialRounds = [], initialHasMoreRounds = false, initialTotalRounds = 0, onRoundRecorded, isFetching = false, hasTwoTeams = false, hasCutter = true, roundRoles = [] }) {
    const [teams, setTeams] = useState(initialTeams);
    const [rounds, setRounds] = useState(initialRounds);
    const [hasMoreRounds, setHasMoreRounds] = useState(initialHasMoreRounds);
    const [isLoadingMoreRounds, setIsLoadingMoreRounds] = useState(false);
    const [elements, setElements] = useState([]);
    const [baseInputs, setBaseInputs] = useState({});
    const [cardInputs, setCardInputs] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [inputErrors, setInputErrors] = useState({});
    const [saveError, setSaveError] = useState('');
    const [gameStatus, setGameStatus] = useState(selectedGame?.status ?? 'in_progress');
    const [showRoundClosureModal, setShowRoundClosureModal] = useState(false);
    const [showRoundClosureConditionsModal, setShowRoundClosureConditionsModal] = useState(false);
    const [roundClosureMissingConditions, setRoundClosureMissingConditions] = useState([]);

    const { unlock: unlockWinnerSound, play: playWinnerSound } = useWinnerSound();

    const [voiceFeedback, setVoiceFeedback] = useState(null);
    const voiceFeedbackTimerRef = useRef(null);
    const [showAliasManager, setShowAliasManager] = useState(false);
    const [lastMisheardCandidates, setLastMisheardCandidates] = useState([]);
    const { aliases, isLoading: aliasesLoading, error: aliasesError, addAlias, removeAlias } = useVoiceAliases();

    const [expandedRound, setExpandedRound] = useState(null);
    const [activeCircleRound, setActiveCircleRound] = useState(null);
    const [closingCircleRound, setClosingCircleRound] = useState(null);
    const [circleButtonRect, setCircleButtonRect] = useState(null);
    const [isHistoryAmendLocked, setIsHistoryAmendLocked] = useState(false);
    const circleTimerRef = useRef(null);
    const activeCircleRoundRef = useRef(activeCircleRound);
    useEffect(() => { activeCircleRoundRef.current = activeCircleRound; }, [activeCircleRound]);

    // Active team tab for mobile (stacked) layout — only one team's form is shown at a time.
    // On sm+ both forms are always visible side-by-side and this state is ignored.
    const [activeTeamTab, setActiveTeamTab] = useState(initialTeams[0]?.id ?? null);

    // When the teams list first populates (e.g. loaded async) ensure a tab is selected.
    useEffect(() => {
        setActiveTeamTab((prev) => {
            if (prev !== null) return prev;
            return teams[0]?.id ?? null;
        });
    }, [teams]);

    const [isCreatorLive, setIsCreatorLive] = useState(false);

    // Snapshot of activeTeamTab taken when the scoring-form circle is opened so
    // the tab selection can be restored exactly when the circle closes.
    const circleOpenTabSnapshotRef = useRef(null);

    // Saves the expandedRound value when a history-row circle is opened so the
    // scoring detail can be restored after the circle's close animation ends.
    const savedExpandedRoundRef = useRef(null);
    // Cache of per-round draft data keyed by round_number.
    const [roundDraftCache, setRoundDraftCache] = useState({});
    const [loadingDraftRound, setLoadingDraftRound] = useState(null);

    // Collapse any expanded round detail and circle when the user clicks anywhere outside a round toggle.
    useEffect(() => {
        const collapse = () => {
            if (isHistoryAmendLocked) return;
            setExpandedRound(null);
            savedExpandedRoundRef.current = null;
            // Restore the active team tab if the circle was open over the scoring form.
            if (circleOpenTabSnapshotRef.current !== null) {
                setActiveTeamTab(circleOpenTabSnapshotRef.current);
                circleOpenTabSnapshotRef.current = null;
            }
            setActiveCircleRound(null);
            setClosingCircleRound(null);
            if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
        };
        document.addEventListener('click', collapse);
        return () => document.removeEventListener('click', collapse);
    }, [isHistoryAmendLocked]);

    // Collapse any expanded round detail when the selected game changes.
    useEffect(() => {
        setExpandedRound(null);
        savedExpandedRoundRef.current = null;
        setActiveCircleRound(null);
        setClosingCircleRound(null);
        circleOpenTabSnapshotRef.current = null;
        setIsHistoryAmendLocked(false);
        if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
        setRoundDraftCache((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    }, [selectedGame?.id]);

    // Clean up the closing-animation timer on unmount.
    useEffect(() => () => { if (circleTimerRef.current) clearTimeout(circleTimerRef.current); }, []);

    // Fetch the archived draft for a round when it is expanded, using a cache
    // so each round is only fetched once per game session.
    useEffect(() => {
        if (expandedRound === null || !selectedGame?.id) return;
        if (roundDraftCache[expandedRound] !== undefined) return;

        let cancelled = false;
        setLoadingDraftRound(expandedRound);

        api
            .get(`/games/${selectedGame.id}/rounds/${expandedRound}/draft`)
            .then((response) => {
                if (cancelled) return;
                const draft = response.data?.data?.round_draft ?? null;
                setRoundDraftCache((prev) => ({ ...prev, [expandedRound]: draft }));
            })
            .catch(() => {
                if (!cancelled) {
                    setRoundDraftCache((prev) => ({ ...prev, [expandedRound]: null }));
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingDraftRound(null);
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedGame?.id is intentionally omitted: the [selectedGame?.id] effect above always resets expandedRound to null before a game switch, preventing stale-game fetches
    }, [expandedRound]);

    // Tracks whether the draft for the current game has been fetched so the
    // auto-save effect is blocked until the initial draft load is complete.
    const draftLoadedRef = useRef(false);
    // Monotonically-incrementing counter used to discard stale draft GET responses.
    // Incremented whenever a new fetch is started or a round is confirmed saved, so
    // any in-flight fetch that resolves later is silently ignored.
    const draftFetchGenRef = useRef(0);
    // When true, the very next auto-save is skipped (used after round submission
    // to prevent saving the reset-to-default inputs as a new draft).
    const skipNextDraftSave = useRef(false);
    // When true, fetchRoundDraft will not update inputs even if the server returns
    // a draft. Set after a round is confirmed to guard against an in-flight draft
    // PUT re-creating a stale active draft that would otherwise be loaded back into
    // the already-cleared inputs. Reset when the user starts entering new values.
    const draftBlockedRef = useRef(false);
    // When true, a user has made input changes that have not yet been persisted
    // (the 800 ms debounce timer is running). fetchRoundDraft must not apply a
    // GET response while this flag is set because the server draft is behind
    // what the user has typed, so applying it would silently clear their work.
    // Reset when the debounce timer fires and the PUT is sent to the server.
    const hasPendingDraftSave = useRef(false);
    const draftSaveTimerRef = useRef(null);
    // Tracks the previous initialRounds length so we can detect when a new round
    // has been recorded by another user (via .game.updated) and clear the inputs.
    const prevRoundsLengthRef = useRef(initialRounds.length);
    // Always-current reference to selectedGame used inside debounced callbacks.
    const selectedGameRef = useRef(selectedGame);
    useEffect(() => { selectedGameRef.current = selectedGame; }, [selectedGame]);

    // Fetch base elements once on mount
    useEffect(() => {
        api.get('/base-elements').then((response) => {
            const els = response.data?.data?.base_elements ?? [];
            setElements(els);
        });
    }, []);

    // Build the default per-element values for a set of teams
    const buildDefaultBaseInputs = (teamList, elementList) =>
        Object.fromEntries(
            teamList.map((t) => [
                t.id,
                Object.fromEntries(
                    elementList.map((el) => [
                        el.id,
                        el.input_type === 'boolean' ? false : 0,
                    ]),
                ),
            ]),
        );

    const buildDefaultCardInputs = (teamList) =>
        Object.fromEntries(teamList.map((t) => [t.id, { cardsInHand: 0, cardsOnTable: 0 }]));

    // Sync from parent whenever initialTeams/initialRounds references change
    useEffect(() => {
        setTeams(initialTeams);
        setRounds(initialRounds);
        setHasMoreRounds(initialHasMoreRounds);

        // Detect a round-completion broadcast: another user recorded a round and
        // the parent pushed a longer initialRounds array via `.game.updated`.
        // Clear inputs so the viewer (or an idle scorer) does not see stale values.
        const roundsGrew = initialRounds.length > prevRoundsLengthRef.current;
        prevRoundsLengthRef.current = initialRounds.length;

        if (roundsGrew) {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
            skipNextDraftSave.current = true;
            setBaseInputs(buildDefaultBaseInputs(initialTeams, elements));
            setCardInputs(buildDefaultCardInputs(initialTeams));
            setInputErrors({});
            setSaveError('');
            return;
        }

        setBaseInputs((prev) => {
            const newIds = new Set(initialTeams.map((t) => t.id));
            const prevIds = new Set(Object.keys(prev).map(Number));
            const same =
                newIds.size === prevIds.size &&
                [...newIds].every((id) => prevIds.has(id));

            return same ? prev : buildDefaultBaseInputs(initialTeams, elements);
        });
        setCardInputs((prev) => {
            const newIds = new Set(initialTeams.map((t) => t.id));
            const prevIds = new Set(Object.keys(prev).map(Number));
            const same =
                newIds.size === prevIds.size &&
                [...newIds].every((id) => prevIds.has(id));

            return same ? prev : buildDefaultCardInputs(initialTeams);
        });
        setInputErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        setSaveError((prev) => (prev !== '' ? '' : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftSaveTimerRef and skipNextDraftSave are stable refs; elements is intentionally excluded to avoid disrupting the dedicated elements-load reset
    }, [initialTeams, initialRounds, initialHasMoreRounds]);

    // Keep gameStatus in sync whenever the selected game's status changes
    // (covers game extension: status flips from 'finished' → 'in_progress' without the id changing).
    useEffect(() => {
        setGameStatus(selectedGame?.status ?? 'in_progress');
    }, [selectedGame?.status]);

    // Reset the rounds-length tracker when the selected game itself changes.
    useEffect(() => {
        prevRoundsLengthRef.current = 0;
    }, [selectedGame?.id]);

    // Also re-seed baseInputs when elements load (if teams are already present)
    useEffect(() => {
        if (elements.length > 0 && teams.length > 0) {
            setBaseInputs((prev) => {
                // Only reset if element keys have changed (first load)
                const firstTeamId = teams[0]?.id;
                const prevEls = Object.keys(prev[firstTeamId] ?? {}).map(Number);

                if (
                    prevEls.length === elements.length &&
                    elements.every((el) => prevEls.includes(el.id))
                ) {
                    return prev;
                }

                return buildDefaultBaseInputs(teams, elements);
            });
        }
    }, [elements]);

    // Fetch the saved draft for the current game once elements are available.
    // Runs on mount (after elements load), whenever the selected game changes,
    // and whenever the screen becomes visible again (via useVisibilityRefresh).
    // Draft values overlay any defaults that were populated by the effects above.
    const fetchRoundDraft = useCallback(() => {
        if (!selectedGameRef.current?.id || elements.length === 0) return;

        draftLoadedRef.current = false;

        // Capture the generation at fetch start so any response that arrives
        // after a round save (which increments draftFetchGenRef) is discarded.
        const myGen = ++draftFetchGenRef.current;

        api
            .get(`/games/${selectedGameRef.current.id}/round-draft`)
            .then((response) => {
                // A round was confirmed while this request was in-flight; discard
                // the stale draft so the cleared inputs are not overwritten.
                if (draftFetchGenRef.current !== myGen) return;

                // A round was just confirmed and we are waiting for the server-side
                // DELETE to remove any stale draft that an in-flight auto-save PUT
                // may have re-created. Skip this response to keep inputs cleared.
                if (draftBlockedRef.current) return;

                // User has unsaved input changes (debounce timer is still running).
                // The server draft is behind what the user has typed — applying it
                // now would silently wipe out their in-progress values.
                if (hasPendingDraftSave.current) return;

                const draft = response.data?.data?.round_draft;
                if (draft?.base_inputs || draft?.card_inputs) {
                    // Prevent the auto-save effect from bouncing a redundant PUT
                    // back to the server just because we overwrote local state.
                    skipNextDraftSave.current = true;
                }
                if (draft?.base_inputs) setBaseInputs(draft.base_inputs);
                if (draft?.card_inputs) setCardInputs(draft.card_inputs);
            })
            .catch(() => { /* silently ignore – leave defaults in place */ })
            .finally(() => {
                if (draftFetchGenRef.current === myGen) {
                    draftLoadedRef.current = true;
                }
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedGameRef and draftFetchGenRef are stable refs kept current by their own effects; setBaseInputs and setCardInputs are stable state setters; elements.length drives re-creation intentionally
    }, [elements.length]);

    useEffect(() => {
        fetchRoundDraft();
    }, [selectedGame?.id, fetchRoundDraft]);

    useVisibilityRefresh(fetchRoundDraft);
    // Re-fetch the draft when the Pusher socket reconnects after an iOS
    // background/foreground cycle, closing the event gap.
    useEchoReconnect(fetchRoundDraft);

    // Debounced auto-save: persist inputs to round-draft whenever they change,
    // but only after the initial draft fetch has completed and the form is active.
    useEffect(() => {
        if (!draftLoadedRef.current || !selectedGameRef.current?.id) return;
        if (selectedGameRef.current.status === 'finished') return;

        if (skipNextDraftSave.current) {
            skipNextDraftSave.current = false;
            return;
        }

        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);

        draftSaveTimerRef.current = setTimeout(() => {
            // Draft is now being persisted — clear the pending flag so that
            // subsequent fetchRoundDraft calls can safely apply the server's
            // up-to-date draft without risking overwriting user input.
            hasPendingDraftSave.current = false;
            const game = selectedGameRef.current;
            if (game?.id) {
                api.put(`/games/${game.id}/round-draft`, {
                    base_inputs: baseInputs,
                    card_inputs: cardInputs,
                    expected_current_round_number: Number(game.current_round_number ?? 0),
                }).catch(() => { /* silently ignore draft save failures */ });
            }
        }, 800);

        return () => {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedGameRef, skipNextDraftSave, and draftSaveTimerRef are stable refs kept current by their own effects; intentionally excluded to prevent the debounce timer from resetting on every ref update
    }, [baseInputs, cardInputs]);

        // Called when a nested numeric input enters inline touch-edit mode so
        // we can mark the draft as having pending changes immediately. This
        // prevents a concurrent fetch from applying a server-side draft that
        // would overwrite the user's in-progress edits.
        const handleEditingStart = useCallback(() => {
            draftBlockedRef.current = false;
            hasPendingDraftSave.current = true;
        }, []);

    // Subscribe to real-time draft updates broadcast by other users in this game.
    // Viewers receive a live read-only preview; editors are excluded via toOthers()
    // on the server side so their own keystrokes are not echoed back.
    //
    // Creator-active handshake (whispers — no backend changes required):
    // • Creator: send whisper('creatorActive') immediately so pre-existing viewers
    //   learn the creator is online, and respond with whisper('creatorActive')
    //   whenever a viewer joins later.
    // • Viewer: listen for 'creatorActive'/'creatorInactive' whispers and update
    //   isCreatorLive accordingly; send whisper('viewerJoined') to prompt the creator.
    // • Creator cleanup: whisper 'creatorInactive' before echo.leave() so viewers
    //   know the creator has switched away.
    useEffect(() => {
        if (!selectedGame?.id || typeof window === 'undefined' || !window.Echo) return;

        // Capture the Echo instance at subscription time so the cleanup closure
        // holds a stable reference even if window.Echo is reassigned later.
        const echo = window.Echo;
        const isCreator = selectedGame?.user_role !== 'viewer';
        const channel = echo.private(`game.${selectedGame.id}`);

        channel.listen('.round.draft.updated', ({ base_inputs, card_inputs }) => {
            // If we're currently blocking draft load (immediately after a
            // round commit) or the user has pending local edits, ignore the
            // incoming broadcast to avoid overwriting the user's in-progress
            // inputs. Otherwise apply the live preview.
            if (draftBlockedRef.current) return;
            if (hasPendingDraftSave.current) return;

            // Skip the next debounced auto-save so receiving an update never
            // triggers a redundant PUT back to the server.
            skipNextDraftSave.current = true;
            if (base_inputs) setBaseInputs(base_inputs);
            if (card_inputs) setCardInputs(card_inputs);
        });

        if (isCreator) {
            // Defer the initial whisper until the WebSocket subscription is
            // confirmed — calling whisper() before the Pusher/Reverb channel
            // is subscribed throws "Cannot read properties of undefined
            // (reading 'trigger')" because the internal channel object doesn't
            // exist yet.
            channel.subscribed(() => {
                channel.whisper('creatorActive', {});
            });
            // When a viewer joins, respond so they learn the creator is online.
            channel.listenForWhisper('viewerJoined', () => {
                channel.whisper('creatorActive', {});
            });
        } else {
            // Viewer: track whether the creator currently has this game open.
            channel.listenForWhisper('creatorActive', () => setIsCreatorLive(true));
            channel.listenForWhisper('creatorInactive', () => setIsCreatorLive(false));
            // Announce arrival so the creator (if online) sends back creatorActive.
            // Deferred for the same reason as the creator whisper above.
            channel.subscribed(() => {
                channel.whisper('viewerJoined', {});
            });
        }

        return () => {
            if (isCreator) {
                // Notify viewers before leaving so the badge hides immediately.
                // Wrapped in try/catch: if the component unmounts during the
                // subscription handshake the internal Pusher channel may not
                // exist yet, and whisper() would throw.
                //
                // The channel is still subscribed at this point because
                // GameCard's useEffect([selectedGameId]) cleanup — which runs in
                // the render cycle BEFORE selectedGame propagates to Dashboard
                // and RoundsCard — defers its own echo.leave() by 300 ms.  This
                // means the Pusher subscription is alive when this cleanup runs,
                // so the whisper reaches viewers synchronously without needing an
                // additional delay here.
                try {
                    channel.whisper('creatorInactive', {});
                } catch (_) {
                    // Subscription never completed; nothing to notify.
                }
            } else {
                setIsCreatorLive(false);
            }
            echo.leave(`game.${selectedGame.id}`);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedGame?.user_role is stable for the lifetime of a selected game; setIsCreatorLive is a stable setter
    }, [selectedGame?.id]);

    const handleElementChange = (teamId, elementId, value) => {
        const el = elements.find((e) => e.id === elementId);

        // If the user is trying to check the Round Closure box, validate that
        // both Burako and at least one canastra are present for this team.
        if (el && (el.label === 'Round Closure' || el.name === 'round_closure') && value === true) {
            const burakoEl = elements.find((e) => e.name === 'burako');
            const canastraEls = elements.filter((e) => e.name.includes('canastra'));

            const teamVals = baseInputs[teamId] ?? {};

            const hasBurako = burakoEl ? !!teamVals[burakoEl.id] : false;
            const hasCanastra = canastraEls.some((ce) => {
                const val = teamVals[ce.id];
                if (ce.input_type === 'boolean') return !!val;
                return (parseInt(val, 10) || 0) > 0;
            });

            const missing = [];
            if (!hasBurako) missing.push('Burako');
            if (!hasCanastra) missing.push('Canastra');

            if (missing.length > 0) {
                setRoundClosureMissingConditions(missing);
                setShowRoundClosureConditionsModal(true);
                return;
            }
        }

        // User is entering values for the new round — unblock draft loading so
        // future fetchRoundDraft calls can restore work-in-progress normally.
        draftBlockedRef.current = false;
        // Signal that there are unsaved changes so any concurrent fetchRoundDraft
        // response is held off until the 800 ms debounce PUT fires.
        hasPendingDraftSave.current = true;
        setBaseInputs((prev) => {
            const next = {
                ...prev,
                [teamId]: { ...prev[teamId], [elementId]: value },
            };

            // When a mutually-exclusive boolean is checked, uncheck it for all other teams.
            if (el?.input_type === 'boolean' && el?.mutually_exclusive && value === true) {
                for (const t of Object.keys(next)) {
                    if (Number(t) !== teamId) {
                        next[t] = { ...next[t], [elementId]: false };
                    }
                }
            }

            return next;
        });
        setInputErrors((prev) => {
            const key = `${teamId}_${elementId}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];

            return next;
        });
    };

    const handleCardChange = (teamId, field, value) => {
        // User is entering values for the new round — unblock draft loading so
        // future fetchRoundDraft calls can restore work-in-progress normally.
        draftBlockedRef.current = false;
        // Signal that there are unsaved changes so any concurrent fetchRoundDraft
        // response is held off until the 800 ms debounce PUT fires.
        hasPendingDraftSave.current = true;
        setCardInputs((prev) => ({
            ...prev,
            [teamId]: { ...prev[teamId], [field]: value },
        }));
        setInputErrors((prev) => {
            const key = `${teamId}_${field}`;
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];

            return next;
        });
    };

    const computeTeamScore = (teamId) => {
        const inHand = parseInt(cardInputs[teamId]?.cardsInHand, 10) || 0;
        const onTable = parseInt(cardInputs[teamId]?.cardsOnTable, 10) || 0;

        const scoreOverrideActive = elements.some(
            (el) => el.score_override && !!baseInputs[teamId]?.[el.id],
        );

        const baseScore = elements.reduce((sum, el) => {
            const val = baseInputs[teamId]?.[el.id];

            if (el.input_type === 'boolean') {
                const isActive = !!val;

                return sum + (isActive ? el.points : -(el.penalty ?? 0));
            }

            const qty = parseInt(val, 10) || 0;

            return sum + (qty > 0 ? el.points * qty : -(el.penalty ?? 0));
        }, 0);

        // Cards on table is subtracted when all scoring canastras are zero OR
        // when a score_override element is active.
        const canastrasAllZero = elements
            .filter((el) => el.name.includes('canastra') && !el.score_override)
            .every((el) => {
                const val = baseInputs[teamId]?.[el.id];

                return el.input_type === 'boolean' ? !val : (parseInt(val, 10) || 0) === 0;
            });

        return (scoreOverrideActive || canastrasAllZero)
            ? baseScore - inHand - onTable
            : baseScore - inHand + onTable;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setInputErrors({});
        setSaveError('');

        const newErrors = {};

        for (const team of teams) {
            for (const el of elements) {
                if (el.input_type === 'quantity') {
                    const val = baseInputs[team.id]?.[el.id] ?? 0;

                    if (!Number.isInteger(Number(val)) || Number(val) < 0) {
                        newErrors[`${team.id}_${el.id}`] =
                            `${el.label} must be a whole number ≥ 0.`;
                    }
                }
            }

            const inHand = cardInputs[team.id]?.cardsInHand ?? 0;

            if (!Number.isInteger(Number(inHand)) || Number(inHand) < 0) {
                newErrors[`${team.id}_cardsInHand`] = 'Cards in hand must be a whole number ≥ 0.';
            }

            const onTable = cardInputs[team.id]?.cardsOnTable ?? 0;

            if (!Number.isInteger(Number(onTable)) || Number(onTable) < 0) {
                newErrors[`${team.id}_cardsOnTable`] = 'Points on table must be a whole number ≥ 0.';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setInputErrors(newErrors);

            return;
        }

        // Verify a Round Closure checkbox is set for exactly one team.
        const closureEl = elements.find((el) => el.label === 'Round Closure' || el.name === 'round_closure');
        if (closureEl) {
            const checkedCount = teams.filter((t) => !!baseInputs[t.id]?.[closureEl.id]).length;
            if (checkedCount !== 1) {
                setShowRoundClosureModal(true);
                return;
            }
        }

        // flushSync forces React to commit these state updates to the real DOM
        // before JavaScript continues.  The subsequent setTimeout(0) yields to
        // the browser's macrotask queue so it can paint the spinner frame before
        // the network request starts — without this the browser may not repaint
        // until the microtask (axios promise) settles, making the spinner
        // invisible on fast connections.
        flushSync(() => {
            setExpandedRound(null);
            setIsSaving(true);
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Unlock the AudioContext after the spinner has painted.  This must
        // still be initiated within the same user-gesture task so iOS Safari
        // honours the resume() call — but ctx.resume() is fire-and-forget; we
        // do NOT await it so a slow OS audio session wake-up (2-3 s after
        // inactivity) cannot delay the network request.
        unlockWinnerSound();

        try {
            const response = await api.post(
                `/games/${selectedGame.id}/rounds`,
                {
                    scores: teams.map((t) => ({
                        team_id: t.id,
                        points: computeTeamScore(t.id),
                    })),
                },
            );

            const gameSummary = response.data?.data?.game ?? {};
            const updatedTeams = gameSummary.teams ?? teams;
            const newGameStatus = gameSummary.game?.status ?? gameStatus;

            // Confirm the round was actually persisted: the API always returns a
            // game object with an id inside a committed transaction, so a missing
            // id means the response is malformed or the transaction did not commit.
            const roundConfirmed = !!gameSummary.game?.id;

            if (roundConfirmed) {
                setTeams(updatedTeams);
                setRounds(gameSummary.rounds ?? rounds);
                setHasMoreRounds(gameSummary.has_more_rounds ?? false);
                setGameStatus(newGameStatus);
                if (newGameStatus === 'finished') playWinnerSound();
                // Advance the fetch generation so any draft GET that is still
                // in-flight (triggered by a visibility or reconnect event just
                // before the user tapped save) cannot overwrite the cleared state.
                draftFetchGenRef.current += 1;
                // Cancel any pending draft save and skip the next one triggered by
                // the input reset below — the backend already deleted the draft.
                if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
                skipNextDraftSave.current = true;
                // Block fetchRoundDraft from overwriting the cleared inputs while
                // the server-side DELETE is in-flight. An in-flight auto-save PUT
                // that races with the POST could re-create an active draft; the
                // DELETE removes it. draftBlockedRef is reset when the user first
                // modifies an input for the new round.
                draftBlockedRef.current = true;
                // No pending save exists once a round is confirmed — the draft
                // was archived/deleted by the round commit on the backend.
                hasPendingDraftSave.current = false;
                Promise.resolve(
                    api.delete(`/games/${selectedGame.id}/round-draft`),
                ).catch(() => { /* fire-and-forget */ });
                setBaseInputs(buildDefaultBaseInputs(updatedTeams, elements));
                setCardInputs(buildDefaultCardInputs(updatedTeams));
                onRoundRecorded?.(updatedTeams, newGameStatus, gameSummary);
            } else {
                setSaveError('Unable to record the round right now.');
            }
        } catch {
            setSaveError('Unable to record the round right now.');
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Handles a parsed voice command dispatched by useVoiceCommands.
     *
     * @param {{ type: string, action?: string, elementId?: number, teamId?: number, quantity?: number }} command
     *   Structured command produced by the voice-command parser.
     * @return {void}
     *
     * Logic: Routes 'save' commands to the existing handleSubmit function (with a
     * synthetic no-op event). Routes 'element' commands to handleElementChange for
     * boolean elements, or directly mutates baseInputs for quantity elements using
     * the same add/remove/zero/set semantics as the numeric steppers.
     */
    const handleVoiceCommand = (command) => {
        if (command.type === 'save') {
            handleSubmit({ preventDefault: () => {} });
            return;
        }

        if (command.type !== 'element') return;

        const { action, elementId, teamId, quantity } = command;
        const el = elements.find((e) => e.id === elementId);
        if (!el) return;

        if (el.input_type === 'boolean') {
            handleElementChange(teamId, elementId, action === 'add' || action === 'set');
        } else {
            // Voice quantity commands bypass handleElementChange, so set the flag
            // directly so fetchRoundDraft does not overwrite the spoken value.
            hasPendingDraftSave.current = true;
            setBaseInputs((prev) => {
                const current = parseInt(prev[teamId]?.[elementId], 10) || 0;
                let next;
                switch (action) {
                    case 'add': next = current + quantity; break;
                    case 'remove': next = Math.max(0, current - quantity); break;
                    case 'zero': next = 0; break;
                    case 'set': next = quantity; break;
                    default: next = current;
                }
                return { ...prev, [teamId]: { ...prev[teamId], [elementId]: next } };
            });
        }
    };

    /**
     * Receives feedback from useVoiceCommands and shows it as an auto-dismissing toast.
     *
     * @param {{ ok: boolean, message: string }} feedback - Result of the last recognition attempt.
     * @return {void}
     *
     * Logic: Successful feedback (`ok: true`) auto-dismisses after 3.5 seconds.
     * Error feedback (`ok: false`) persists on screen until the user clicks the mic
     * button again (it is cleared in handleMicToggle).
     */
    const handleVoiceFeedback = (feedback) => {
        setVoiceFeedback(feedback);
        if (feedback.misheardCandidates) setLastMisheardCandidates(feedback.misheardCandidates);
        if (voiceFeedbackTimerRef.current) clearTimeout(voiceFeedbackTimerRef.current);
        if (feedback.ok) {
            voiceFeedbackTimerRef.current = setTimeout(() => setVoiceFeedback(null), 3500);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- voiceFeedbackTimerRef is a stable ref
    useEffect(() => () => {
        if (voiceFeedbackTimerRef.current) clearTimeout(voiceFeedbackTimerRef.current);
    }, []);

    const { isSupported: voiceSupported, isListening, isReady: micReady, isSpeaking, toggle: toggleMic } = useVoiceCommands({
        elements,
        teams,
        onCommand: handleVoiceCommand,
        onFeedback: handleVoiceFeedback,
        aliases,
    });

    const handleMicToggle = () => {
        setVoiceFeedback(null);
        if (voiceFeedbackTimerRef.current) clearTimeout(voiceFeedbackTimerRef.current);
        toggleMic();
    };

    const getAccruedScore = (teamId) =>
        rounds.reduce((sum, round) => {
            const s = round.scores?.find((sc) => sc.team_id === teamId);
            return sum + (s ? s.points : 0);
        }, 0);

    /**
     * Toggles the player-circle overlay for a specific round.
     * Opens with an animated scale-in; closing plays scale-out then removes the element.
     * When opening for the current (scoring-form) round all team score-input sections
     * are individually collapsed and their prior visibility is saved so closing the
     * circle restores only the teams that were visible before.
     *
     * @param {Event}  e           - Click event — stopped so the document collapse handler is skipped.
     * @param {number} roundNumber - The round number whose circle should be toggled.
     * @return {void}
     * Logic: If the round is currently open, restores the saved active-tab snapshot
     *        (if any), marks the circle as "closing" (keeps it in DOM for the CSS exit
     *        transition), then clears it after 520 ms.
     *        If a different round is being opened any in-progress closing is cancelled.
     *        If the opened round equals the next (scoring) round, the current active tab
     *        is saved so it can be restored after the circle closes.
     */
    const toggleCircle = (e, roundNumber) => {
        e.stopPropagation();
        if (isHistoryAmendLocked && roundNumber !== nextRound) return;
        if (activeCircleRoundRef.current === roundNumber) {
            // Start closing animation; restore state only after the circle is fully gone.
            // Keep circleButtonRect so the close animation can travel back to the button.
            setActiveCircleRound(null);
            setClosingCircleRound(roundNumber);
            if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
            const pendingExpanded = savedExpandedRoundRef.current;
            const pendingTab = circleOpenTabSnapshotRef.current;
            savedExpandedRoundRef.current = null;
            circleOpenTabSnapshotRef.current = null;
            circleTimerRef.current = setTimeout(() => {
                // Restore active team tab and scoring detail after animation ends.
                if (pendingTab !== null) setActiveTeamTab(pendingTab);
                setClosingCircleRound(null);
                if (pendingExpanded !== null) setExpandedRound(pendingExpanded);
            }, 520);
        } else {
            if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
            setClosingCircleRound(null);
            // Capture the button's position so the genie animation can fly out from it.
            setCircleButtonRect(e.currentTarget.getBoundingClientRect());
            // For history rows: hide the scoring detail immediately before opening the circle.
            if (roundNumber !== nextRound) {
                setExpandedRound((prev) => {
                    if (prev === roundNumber) {
                        savedExpandedRoundRef.current = roundNumber;
                        return null;
                    }
                    savedExpandedRoundRef.current = null;
                    return prev;
                });
            }
            setActiveCircleRound(roundNumber);
            // Opening for the scoring form: save active tab snapshot (no visual change needed;
            // the circle already hides the form via activeCircleRound guard).
            if (roundNumber === nextRound) {
                circleOpenTabSnapshotRef.current = activeTeamTab;
            }
        }
    };

    const nextRound = rounds.length + 1;

    /**
     * Load the next page of earlier rounds and prepend them to the history.
     *
     * @return {Promise<void>}
     * Logic: derive the earliest round_number currently loaded (or 1 if rounds is empty),
     *   call GET /games/{id}/rounds?before_round={earliest}&limit=25, prepend the returned
     *   items to the local rounds state and update hasMoreRounds from the response flag.
     */
    const handleLoadEarlierRounds = async () => {
        if (isLoadingMoreRounds || !selectedGame) return;

        const earliestRound = rounds.length > 0 ? rounds[0].round_number : 1;

        setIsLoadingMoreRounds(true);
        try {
            const response = await api.get(`/games/${selectedGame.id}/rounds`, {
                params: { before_round: earliestRound, limit: 25 },
            });
            const page = response.data?.data?.rounds ?? {};
            const items = page.items ?? [];
            setRounds((prev) => [...items, ...prev]);
            setHasMoreRounds(page.has_more ?? false);
        } catch {
            // Silent — the existing rounds remain intact; user can retry.
        } finally {
            setIsLoadingMoreRounds(false);
        }
    };

    /**
     * Persist an amendment for a closed round and refresh local round/game state.
     *
     * @param {number} roundNumber
     * @param {{scores: Array<{team_id:number, points:number}>, base_inputs?: object, card_inputs?: object}} payload
     * @return {Promise<boolean>}
     * Logic: PATCH the amended round, then merge the returned game summary into local state so
     * history chips, totals, and status stay reactive without a full-page refresh.
     */
    const handleSaveRoundAmendment = async (roundNumber, payload) => {
        if (!selectedGame?.id) return false;

        try {
            const response = await api.patch(`/games/${selectedGame.id}/rounds/${roundNumber}`, payload);
            const gameSummary = response.data?.data?.game ?? {};
            const updatedTeams = gameSummary.teams ?? teams;
            const updatedRounds = gameSummary.rounds ?? rounds;
            const newGameStatus = gameSummary.game?.status ?? gameStatus;

            setTeams(updatedTeams);
            setRounds(updatedRounds);
            setHasMoreRounds(gameSummary.has_more_rounds ?? hasMoreRounds);
            setGameStatus(newGameStatus);
            setRoundDraftCache((prev) => ({
                ...prev,
                [roundNumber]: {
                    base_inputs: payload.base_inputs ?? {},
                    card_inputs: payload.card_inputs ?? {},
                },
            }));
            onRoundRecorded?.(updatedTeams, newGameStatus, gameSummary);
            return true;
        } catch {
            return false;
        }
    };

    const playerCountMismatch =
        teams.length === 2 && teams[0].players.length !== teams[1].players.length;
    const showScoringForm = !playerCountMismatch && (hasTwoTeams || teams.length >= 2);

    const currentRoundRolesForPanel = roundRoles.find(
        (r) => Number(r.round_number) === nextRound,
    ) ?? null;

    /**
     * Map from player_id to role label for the next round.
     * Computed from currentRoundRolesForPanel so chips in the reference strip
     * can look up a player's role in O(1).
     *
     * @type {Record<number, string>}
     */
    const playerRoleForNextRound = (() => {
        if (!currentRoundRolesForPanel) return {};
        const map = {};
        for (const key of Object.keys(PLAYER_ROLE_LABEL_MAP)) {
            const entry = currentRoundRolesForPanel[key];
            if (entry?.player_id != null) {
                map[entry.player_id] = PLAYER_ROLE_LABEL_MAP[key];
            }
        }
        return map;
    })();

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_56%,_#eef2ff_100%)] px-6 py-6">
                <div className="max-w-2xl space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                        Rounds &amp; Scoring
                    </p>
                    <h3 className="text-2xl font-semibold text-slate-900">
                        Record scores and track round history.
                    </h3>
                    <p className="text-sm text-slate-600">
                        Enter each team&apos;s score after every round to keep
                        the scoreboard up to date.
                    </p>
                </div>

            </div>

            {! selectedGame ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Select a game above to record rounds.
                </p>
            ) : isFetching && ! showScoringForm ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Loading rounds…
                </p>
            ) : playerCountMismatch ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Both teams must have the same number of players to record rounds.
                </p>
            ) : ! showScoringForm ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Add both teams before recording rounds.
                </p>
            ) : ! hasCutter ? (
                <p className="px-6 py-5 text-sm text-slate-400">
                    Waiting for round 1 cutter to be set in the Player Order section ...
                </p>
            ) : (
                <>
                    {gameStatus === 'finished' ? (
                        <div className="border-b border-slate-100 px-6 py-5">
                            <p className="text-sm font-medium text-slate-500">
                                This game has concluded — no further rounds can be recorded.
                            </p>
                        </div>
                    ) : selectedGame?.user_role === 'viewer' ? (
                        <ViewerRoundPanel
                            teams={teams}
                            elements={elements}
                            baseInputs={baseInputs}
                            cardInputs={cardInputs}
                            nextRound={nextRound}
                            currentRoundRolesForPanel={currentRoundRolesForPanel}
                            activeCircleRound={activeCircleRound}
                            closingCircleRound={closingCircleRound}
                            circleButtonRect={circleButtonRect}
                            computeTeamScore={computeTeamScore}
                            getAccruedScore={getAccruedScore}
                            onToggleCircle={toggleCircle}
                            isCreatorLive={isCreatorLive}
                            targetPoints={selectedGame?.target_points ?? null}
                        />
                    ) : (
                        <div className="relative border-b border-slate-100 px-6 py-5">
                            {/* In-progress overlay — shown while the round POST is in flight */}
                            {isSaving && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-[2px]">
                                    <CardSpinner message="Recording…" />
                                </div>
                            )}

                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                                    Round {nextRound}
                                </p>
                                <div className="flex items-center gap-1">
                                    <VoiceMicButton
                                        feedback={voiceFeedback}
                                        isListening={isListening}
                                        isReady={micReady}
                                        isSpeaking={isSpeaking}
                                        isSupported={voiceSupported}
                                        onToggle={handleMicToggle}
                                    />
                                    {voiceSupported && (
                                        <button
                                            aria-label={showAliasManager ? 'Hide voice aliases' : 'Manage voice aliases'}
                                            aria-pressed={showAliasManager}
                                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                                                showAliasManager
                                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                    : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                                            }`}
                                            onClick={() => setShowAliasManager((v) => !v)}
                                            type="button"
                                        >
                                            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    )}
                                <button
                                    aria-expanded={activeCircleRound === nextRound}
                                    aria-label={`${activeCircleRound === nextRound ? 'Hide' : 'Show'} seating circle for round ${nextRound}`}
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                                        activeCircleRound === nextRound
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                                    }`}
                                    onClick={(e) => toggleCircle(e, nextRound)}
                                    type="button"
                                >
                                    <svg
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                                    </svg>
                                </button>
                                </div>
                            </div>

                            {/* Voice alias manager — toggled by the + button next to the mic */}
                            {showAliasManager && (
                                <div className="mb-4">
                                    <VoiceAliasManager
                                        aliases={aliases}
                                        error={aliasesError}
                                        isLoading={aliasesLoading}
                                        misheardOptions={lastMisheardCandidates}
                                        onAdd={addAlias}
                                        onRemove={removeAlias}
                                    />
                                </div>
                            )}

                            {/* Role panel — circular seating diagram (same as round history cards) */}
                            {(activeCircleRound === nextRound || closingCircleRound === nextRound) && (
                                <div className="mb-4 flex justify-center overflow-visible">
                                    <PlayerCircle
                                        buttonRect={circleButtonRect}
                                        isOpen={activeCircleRound === nextRound}
                                        players={teams.flatMap((t) => t.players)}
                                        roundNumber={nextRound}
                                        roundRoles={currentRoundRolesForPanel}
                                    />
                                </div>
                            )}


                            {/* Score form — hidden while circle is open or animating closed */}
                            {activeCircleRound !== nextRound && closingCircleRound !== nextRound && (
                            <form onSubmit={handleSubmit}>
                                {/* Mobile team tab selector — visible only on stacked (< sm) layout */}
                                <div className="mb-4 grid grid-cols-2 gap-3 sm:hidden">
                                    {teams.map((team) => {
                                        const roundScore = computeTeamScore(team.id);
                                        const partialScore = getAccruedScore(team.id) + roundScore;
                                        const other = teams.find((t) => t.id !== team.id);
                                        const otherPartial = other ? getAccruedScore(other.id) + computeTeamScore(other.id) : null;
                                        const bothPos = partialScore > 0 && otherPartial !== null && otherPartial > 0;
                                        const partialChipCls = partialScore < 0
                                            ? 'bg-red-100 text-red-800'
                                            : partialScore === 0
                                                ? 'bg-[bisque] text-green-700'
                                                : bothPos && partialScore < otherPartial
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-green-100 text-green-800';
                                        const roundChipCls = roundScore < 0
                                            ? 'bg-red-100 text-red-800'
                                            : roundScore === 0
                                                ? 'bg-slate-100 text-slate-600'
                                                : 'bg-indigo-100 text-indigo-800';
                                        const isActive = activeTeamTab === team.id;
                                        return (
                                            <button
                                                key={team.id}
                                                aria-pressed={isActive}
                                                aria-label={`Show ${team.name} score inputs`}
                                                className={`rounded-2xl border p-3 text-left transition-all ${
                                                    isActive
                                                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300'
                                                        : 'border-slate-100 bg-slate-50/60 hover:border-slate-300'
                                                }`}
                                                onClick={() => setActiveTeamTab(team.id)}
                                                type="button"
                                            >
                                                <p className="mb-1.5 text-sm font-semibold text-slate-700 truncate">
                                                    {team.name}
                                                </p>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-slate-400">Rnd:</span>
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${roundChipCls}`}>
                                                            {roundScore}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-slate-400">Tot:</span>
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${partialChipCls}`}>
                                                            {partialScore}
                                                        </span>
                                                    </div>
                                                    {selectedGame?.target_points != null && (() => {
                                                        const rem = Math.max(0, selectedGame.target_points - partialScore);
                                                        return rem > 0 ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-medium text-slate-400">Rem:</span>
                                                                <span
                                                                    className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-700"
                                                                    title="Points remaining to reach the game goal"
                                                                >
                                                                    -{rem}
                                                                </span>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                    {teams.map((team) => (
                                        <div
                                            key={team.id}
                                            className={`rounded-2xl border border-slate-100 bg-slate-50/60 p-4 ${activeTeamTab !== team.id ? 'hidden sm:block' : ''}`}
                                        >
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-700">
                                                    {team.name}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const roundScore = computeTeamScore(team.id);
                                                        const partialScore = getAccruedScore(team.id) + roundScore;
                                                        const other = teams.find((t) => t.id !== team.id);
                                                        const otherPartial = other ? getAccruedScore(other.id) + computeTeamScore(other.id) : null;
                                                        const bothPos = partialScore > 0 && otherPartial !== null && otherPartial > 0;
                                                        const partialChipCls = partialScore < 0
                                                            ? 'bg-red-100 text-red-800'
                                                            : partialScore === 0
                                                                ? 'bg-[bisque] text-green-700'
                                                                : bothPos && partialScore < otherPartial
                                                                    ? 'bg-yellow-100 text-yellow-800'
                                                                    : 'bg-green-100 text-green-800';
                                                        const roundChipCls = roundScore < 0
                                                            ? 'bg-red-100 text-red-800'
                                                            : roundScore === 0
                                                                ? 'bg-slate-100 text-slate-600'
                                                                : 'bg-indigo-100 text-indigo-800';
                                                        return (
                                                            <>
                                                                <span className="text-xs font-medium text-slate-400">Round:</span>
                                                                <span
                                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${roundChipCls}`}
                                                                    title="This round's score"
                                                                >
                                                                    {roundScore}
                                                                </span>
                                                                <span className="text-xs font-medium text-slate-400">Total:</span>
                                                                <span
                                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${partialChipCls}`}
                                                                    title="Accrued score + this round"
                                                                >
                                                                    {partialScore}
                                                                </span>
                                                                {selectedGame?.target_points != null && (() => {
                                                                    const rem = Math.max(0, selectedGame.target_points - partialScore);
                                                                    return rem > 0 ? (
                                                                        <>
                                                                            <span className="text-xs font-medium text-slate-400">Rem:</span>
                                                                            <span
                                                                                className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-sky-700"
                                                                                title="Points remaining to reach the game goal"
                                                                            >
                                                                                -{rem}
                                                                            </span>
                                                                        </>
                                                                    ) : null;
                                                                })()}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {elements.length === 0 ? (
                                                <p className="text-xs text-slate-400">
                                                    Loading elements…
                                                </p>
                                            ) : (
                                                <BaseElementsInput
                                                    cardErrors={{
                                                        cardsInHand: inputErrors[`${team.id}_cardsInHand`],
                                                        cardsOnTable: inputErrors[`${team.id}_cardsOnTable`],
                                                    }}
                                                    cardsInHand={cardInputs[team.id]?.cardsInHand ?? 0}
                                                    cardsOnTable={cardInputs[team.id]?.cardsOnTable ?? 0}
                                                    elements={elements}
                                                    errors={Object.fromEntries(
                                                        Object.entries(inputErrors)
                                                            .filter(([k]) =>
                                                                k.startsWith(`${team.id}_`) &&
                                                                !k.endsWith('_cardsInHand') &&
                                                                !k.endsWith('_cardsOnTable'),
                                                            )
                                                            .map(([k, v]) => [
                                                                parseInt(
                                                                    k.split('_')[1],
                                                                    10,
                                                                ),
                                                                v,
                                                            ]),
                                                    )}
                                                    onChange={(elId, val) =>
                                                        handleElementChange(
                                                            team.id,
                                                            elId,
                                                            val,
                                                        )
                                                    }
                                                    onCardsChange={(field, val) =>
                                                        handleCardChange(team.id, field, val)
                                                    }
                                                    onEditingStart={handleEditingStart}
                                                    showBaseElements
                                                    teamId={team.id}
                                                    values={baseInputs[team.id] ?? {}}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <InputError className="mt-3" message={saveError} />

                                <div className="mt-4 flex justify-end">
                                    <PrimaryButton
                                        disabled={isSaving}
                                        type="submit"
                                    >
                                        {isSaving ? 'Recording…' : 'Record Round'}
                                    </PrimaryButton>
                                </div>
                            </form>
                            )}
                        </div>
                    )}

                    <RoundHistoryTable
                        rounds={rounds}
                        teams={teams}
                        canAmend={selectedGame?.user_role === 'creator'}
                        roundRoles={roundRoles}
                        elements={elements}
                        roundDraftCache={roundDraftCache}
                        loadingDraftRound={loadingDraftRound}
                        expandedRound={expandedRound}
                        activeCircleRound={activeCircleRound}
                        closingCircleRound={closingCircleRound}
                        circleButtonRect={circleButtonRect}
                        hasMoreRounds={hasMoreRounds}
                        isLoadingMoreRounds={isLoadingMoreRounds}
                        onExpandRound={(roundNumber) =>
                            setExpandedRound((prev) => {
                                if (isHistoryAmendLocked) return prev;
                                return prev === roundNumber ? null : roundNumber;
                            })
                        }
                        onToggleCircle={toggleCircle}
                        onLoadEarlier={handleLoadEarlierRounds}
                        onSaveAmend={handleSaveRoundAmendment}
                        onAmendModeChange={setIsHistoryAmendLocked}
                    />
                </>
            )}
            <Modal
                show={showRoundClosureModal}
                onClose={() => setShowRoundClosureModal(false)}
                maxWidth="md"
            >
                <div className="p-6">
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                        <h3 className="text-lg font-medium text-amber-900">Round Closure required</h3>
                        <div className="mt-2">
                            <p className="text-sm text-amber-700">One team must have the Round Closure checked before recording the round.</p>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <PrimaryButton onClick={() => setShowRoundClosureModal(false)}>OK</PrimaryButton>
                    </div>
                </div>
            </Modal>

            <Modal
                show={showRoundClosureConditionsModal}
                onClose={() => setShowRoundClosureConditionsModal(false)}
                maxWidth="md"
            >
                <div className="p-6">
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                        <h3 className="text-lg font-medium text-amber-900">Round Closure requirements</h3>
                        <div className="mt-2">
                            <p className="text-sm text-amber-700">You cannot mark Round Closure until the following conditions are met:</p>
                            <ul className="mt-2 list-disc list-inside text-sm text-amber-700">
                                {roundClosureMissingConditions.map((m) => (
                                    <li key={m}>{m}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <PrimaryButton onClick={() => setShowRoundClosureConditionsModal(false)}>OK</PrimaryButton>
                    </div>
                </div>
            </Modal>
        </section>
    );
}
