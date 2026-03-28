import api from '@/api/client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import BaseElementsInput from '@/Components/BaseElementsInput';
import CardSpinner from '@/Components/CardSpinner';
import VoiceAliasManager from '@/Components/VoiceAliasManager';
import VoiceMicButton from '@/Components/VoiceMicButton';
import useVoiceAliases from '@/hooks/useVoiceAliases';
import useVoiceCommands from '@/hooks/useVoiceCommands';

/** Human-readable labels for each round role key, used in the player order reference strip. */
const PLAYER_ROLE_LABEL_MAP = {
    cutter: 'Cutter',
    dealer: 'Dealer',
    first_draw: 'First Draw',
};
import InputError from '@/Components/InputError';
import PlayerCircle from '@/Components/PlayerCircle';
import PrimaryButton from '@/Components/PrimaryButton';
import useWinnerSound from '@/hooks/useWinnerSound';

export default function RoundsCard({ selectedGame, initialTeams = [], initialRounds = [], onRoundRecorded, isFetching = false, hasTwoTeams = false, hasCutter = true, roundRoles = [] }) {
    const [teams, setTeams] = useState(initialTeams);
    const [rounds, setRounds] = useState(initialRounds);
    const [elements, setElements] = useState([]);
    const [baseInputs, setBaseInputs] = useState({});
    const [cardInputs, setCardInputs] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [inputErrors, setInputErrors] = useState({});
    const [saveError, setSaveError] = useState('');
    const [gameStatus, setGameStatus] = useState(selectedGame?.status ?? 'in_progress');

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
    const circleTimerRef = useRef(null);
    const activeCircleRoundRef = useRef(activeCircleRound);
    useEffect(() => { activeCircleRoundRef.current = activeCircleRound; }, [activeCircleRound]);

    const [collapsedTeams, setCollapsedTeams] = useState(new Set());

    // Always-current ref so the matchMedia handler below can read collapsedTeams
    // without needing to re-register the listener on every state change.
    const collapsedTeamsRef = useRef(collapsedTeams);
    useEffect(() => { collapsedTeamsRef.current = collapsedTeams; }, [collapsedTeams]);

    // Holds the stacked-layout collapse state so it can be restored when the
    // viewport transitions back from a non-stacked (sm+) width.
    const savedCollapsedTeamsRef = useRef(new Set());

    // Snapshot of collapsedTeams taken when the scoring-form circle is opened.
    // Allows per-team visibility to be restored exactly when the circle closes.
    const circleOpenCollapseSnapshotRef = useRef(null);

    // Saves the expandedRound value when a history-row circle is opened so the
    // scoring detail can be restored after the circle's close animation ends.
    const savedExpandedRoundRef = useRef(null);

    // Expand all team score cards when the viewport is non-stacked (sm+) so
    // both inputs are always visible side-by-side.  When the viewport returns
    // to a stacked layout the per-team collapse state is restored.
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const mq = window.matchMedia('(min-width: 640px)');

        if (mq.matches) {
            savedCollapsedTeamsRef.current = new Set(collapsedTeamsRef.current);
            setCollapsedTeams(new Set());
        }

        const handleChange = (e) => {
            if (e.matches) {
                savedCollapsedTeamsRef.current = new Set(collapsedTeamsRef.current);
                setCollapsedTeams(new Set());
            } else {
                setCollapsedTeams(new Set(savedCollapsedTeamsRef.current));
            }
        };

        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const teamRefs = useRef(new Map());

    const toggleTeamCollapse = (teamId) => {
        setCollapsedTeams((prev) => {
            const next = new Set(prev);
            const isExpanding = next.has(teamId);
            if (isExpanding) next.delete(teamId);
            else next.add(teamId);

            if (isExpanding) {
                requestAnimationFrame(() => {
                    teamRefs.current.get(teamId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            } else {
                // When collapsing a team, scroll the other team fully into view.
                const otherTeam = teams.find((t) => t.id !== teamId);
                if (otherTeam) {
                    requestAnimationFrame(() => {
                        teamRefs.current.get(otherTeam.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    });
                }
            }

            return next;
        });
    };
    // Cache of per-round draft data keyed by round_number.
    const [roundDraftCache, setRoundDraftCache] = useState({});
    const [loadingDraftRound, setLoadingDraftRound] = useState(null);

    // Collapse any expanded round detail and circle when the user clicks anywhere outside a round toggle.
    useEffect(() => {
        const collapse = () => {
            setExpandedRound(null);
            savedExpandedRoundRef.current = null;
            // Restore team collapse state if the circle was open over the scoring form.
            if (circleOpenCollapseSnapshotRef.current !== null) {
                setCollapsedTeams(circleOpenCollapseSnapshotRef.current);
                circleOpenCollapseSnapshotRef.current = null;
            }
            setActiveCircleRound(null);
            setClosingCircleRound(null);
            if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
        };
        document.addEventListener('click', collapse);
        return () => document.removeEventListener('click', collapse);
    }, []);

    // Collapse any expanded round detail when the selected game changes.
    useEffect(() => {
        setExpandedRound(null);
        savedExpandedRoundRef.current = null;
        setActiveCircleRound(null);
        setClosingCircleRound(null);
        circleOpenCollapseSnapshotRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedRound]);

    // Tracks whether the draft for the current game has been fetched so the
    // auto-save effect is blocked until the initial draft load is complete.
    const draftLoadedRef = useRef(false);
    // When true, the very next auto-save is skipped (used after round submission
    // to prevent saving the reset-to-default inputs as a new draft).
    const skipNextDraftSave = useRef(false);
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
    }, [initialTeams, initialRounds]);

    // Reset game status and round-length tracker when the selected game changes
    useEffect(() => {
        setGameStatus(selectedGame?.status ?? 'in_progress');
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
    // Runs on mount (after elements load) and whenever the selected game changes.
    // Draft values overlay any defaults that were populated by the effects above.
    useEffect(() => {
        if (!selectedGame?.id || elements.length === 0) return;

        draftLoadedRef.current = false;
        let cancelled = false;

        api
            .get(`/games/${selectedGame.id}/round-draft`)
            .then((response) => {
                if (cancelled) return;
                const draft = response.data?.data?.round_draft;
                if (draft?.base_inputs) setBaseInputs(draft.base_inputs);
                if (draft?.card_inputs) setCardInputs(draft.card_inputs);
            })
            .catch(() => { /* silently ignore – leave defaults in place */ })
            .finally(() => {
                if (!cancelled) draftLoadedRef.current = true;
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGame?.id, elements.length]);

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
            const game = selectedGameRef.current;
            if (game?.id) {
                api.put(`/games/${game.id}/round-draft`, {
                    base_inputs: baseInputs,
                    card_inputs: cardInputs,
                }).catch(() => { /* silently ignore draft save failures */ });
            }
        }, 800);

        return () => {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseInputs, cardInputs]);

    // Subscribe to real-time draft updates broadcast by other users in this game.
    // Viewers receive a live read-only preview; editors are excluded via toOthers()
    // on the server side so their own keystrokes are not echoed back.
    useEffect(() => {
        if (!selectedGame?.id || typeof window === 'undefined' || !window.Echo) return;

        // Capture the Echo instance at subscription time so the cleanup closure
        // holds a stable reference even if window.Echo is reassigned later.
        const echo = window.Echo;

        echo.private(`game.${selectedGame.id}`)
            .listen('.round.draft.updated', ({ base_inputs, card_inputs }) => {
                // Skip the next debounced auto-save so receiving an update never
                // triggers a redundant PUT back to the server.
                skipNextDraftSave.current = true;
                if (base_inputs) setBaseInputs(base_inputs);
                if (card_inputs) setCardInputs(card_inputs);
            });

        return () => {
            echo.leave(`game.${selectedGame.id}`);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGame?.id]);

    const handleElementChange = (teamId, elementId, value) => {
        setBaseInputs((prev) => {
            const el = elements.find((e) => e.id === elementId);
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
            setTeams(updatedTeams);
            setRounds(gameSummary.rounds ?? rounds);
            setGameStatus(newGameStatus);
            if (newGameStatus === 'finished') playWinnerSound();
            // Cancel any pending draft save and skip the next one triggered by
            // the input reset below — the backend already deleted the draft.
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
            skipNextDraftSave.current = true;
            setBaseInputs(buildDefaultBaseInputs(updatedTeams, elements));
            setCardInputs(buildDefaultCardInputs(updatedTeams));
            onRoundRecorded?.(updatedTeams, newGameStatus, gameSummary);
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
     * Logic: If the round is currently open, restores the saved team-collapse snapshot
     *        (if any), marks the circle as "closing" (keeps it in DOM for the CSS exit
     *        transition), then clears it after 520 ms.
     *        If a different round is being opened any in-progress closing is cancelled.
     *        If the opened round equals the next (scoring) round, the current collapse
     *        state is saved and all team cards are collapsed so the form is fully hidden.
     */
    const toggleCircle = (e, roundNumber) => {
        e.stopPropagation();
        if (activeCircleRoundRef.current === roundNumber) {
            // Start closing animation; restore state only after the circle is fully gone.
            // Keep circleButtonRect so the close animation can travel back to the button.
            setActiveCircleRound(null);
            setClosingCircleRound(roundNumber);
            if (circleTimerRef.current) clearTimeout(circleTimerRef.current);
            const pendingExpanded = savedExpandedRoundRef.current;
            const pendingCollapse = circleOpenCollapseSnapshotRef.current;
            savedExpandedRoundRef.current = null;
            circleOpenCollapseSnapshotRef.current = null;
            circleTimerRef.current = setTimeout(() => {
                // Restore per-team visibility and scoring detail after animation ends.
                if (pendingCollapse !== null) setCollapsedTeams(pendingCollapse);
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
            // Opening for the scoring form: save collapse state, then hide both team inputs.
            if (roundNumber === nextRound) {
                circleOpenCollapseSnapshotRef.current = new Set(collapsedTeamsRef.current);
                setCollapsedTeams(new Set(teams.map((t) => t.id)));
            }
        }
    };

    const nextRound = rounds.length + 1;
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
                        <div className="border-b border-slate-100 px-6 py-5">
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                                    Round {nextRound}
                                </p>
                                <div className="flex items-center gap-1">
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
                                    <span
                                        aria-label="Receiving live score updates"
                                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600"
                                    >
                                        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                                        Live
                                    </span>
                                </div>
                            </div>
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
                            {activeCircleRound !== nextRound && closingCircleRound !== nextRound && (
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                {teams.map((team) => {
                                    const roundScore = computeTeamScore(team.id);
                                    const partialScore = getAccruedScore(team.id) + roundScore;
                                    const other = teams.find((t) => t.id !== team.id);
                                    const otherPartial = other
                                        ? getAccruedScore(other.id) + computeTeamScore(other.id)
                                        : null;
                                    const bothPos =
                                        partialScore > 0 &&
                                        otherPartial !== null &&
                                        otherPartial > 0;
                                    const partialChipCls =
                                        partialScore < 0
                                            ? 'bg-red-100 text-red-800'
                                            : partialScore === 0
                                                ? 'bg-[bisque] text-green-700'
                                                : bothPos && partialScore < otherPartial
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-green-100 text-green-800';
                                    const roundChipCls =
                                        roundScore < 0
                                            ? 'bg-red-100 text-red-800'
                                            : roundScore === 0
                                                ? 'bg-slate-100 text-slate-600'
                                                : 'bg-indigo-100 text-indigo-800';

                                    return (
                                        <div key={team.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-700">
                                                    {team.name}
                                                </p>
                                                <div className="flex items-center gap-2">
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
                                                </div>
                                            </div>
                                            {elements.length === 0 ? (
                                                <p className="text-xs text-slate-400">Loading elements…</p>
                                            ) : (
                                                <BaseElementsInput
                                                    cardsInHand={cardInputs[team.id]?.cardsInHand ?? 0}
                                                    cardsOnTable={cardInputs[team.id]?.cardsOnTable ?? 0}
                                                    elements={elements}
                                                    readOnly
                                                    teamId={team.id}
                                                    values={baseInputs[team.id] ?? {}}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            )}
                        </div>
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
                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                    {teams.map((team) => (
                                        <div
                                            key={team.id}
                                            ref={(el) => {
                                                if (el) teamRefs.current.set(team.id, el);
                                                else teamRefs.current.delete(team.id);
                                            }}
                                            className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
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
                                                            </>
                                                        );
                                                    })()}
                                                    <button
                                                        aria-expanded={!collapsedTeams.has(team.id)}
                                                        aria-label={`${collapsedTeams.has(team.id) ? 'Expand' : 'Collapse'} ${team.name} score inputs`}
                                                        className="sm:hidden inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                                        onClick={() => toggleTeamCollapse(team.id)}
                                                        type="button"
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            className={`h-4 w-4 transition-transform duration-200 ${collapsedTeams.has(team.id) ? '-rotate-90' : 'rotate-0'}`}
                                                            fill="currentColor"
                                                            viewBox="0 0 20 20"
                                                        >
                                                            <path
                                                                clipRule="evenodd"
                                                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                                                fillRule="evenodd"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {!collapsedTeams.has(team.id) && elements.length === 0 ? (
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
                                                    showBaseElements={!collapsedTeams.has(team.id)}
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

                    <div className="px-6 py-5">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                            Round History
                        </p>

                        {rounds.length === 0 ? (
                            <p className="text-sm italic text-slate-400">
                                No rounds recorded yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="pb-2 text-left text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Round
                                            </th>
                                            {teams.map((t) => (
                                                <th
                                                    key={t.id}
                                                    className="pb-2 text-right text-xs font-semibold uppercase tracking-[0.25em] text-slate-400"
                                                >
                                                    {t.name}
                                                </th>
                                            ))}
                                            <th className="pb-2 pl-3 w-16" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {rounds.map((round) => (
                                            <Fragment key={round.round_number}>
                                                <tr>
                                                    <td className="py-2 font-medium text-slate-700">
                                                        {round.round_number}
                                                    </td>
                                                    {teams.map((t) => {
                                                        const s = round.scores.find((sc) => sc.team_id === t.id);
                                                        const otherS = round.scores.find((sc) => sc.team_id !== t.id);
                                                        const pts = s ? s.points : null;
                                                        const otherPts = otherS ? otherS.points : null;
                                                        const bothPos = pts !== null && pts > 0 && otherPts !== null && otherPts > 0;
                                                        const chipCls = pts === null
                                                            ? ''
                                                            : pts < 0
                                                                ? 'bg-red-100 text-red-800'
                                                                : pts === 0
                                                                    ? 'bg-[bisque] text-green-700'
                                                                    : bothPos && pts < otherPts
                                                                        ? 'bg-yellow-100 text-yellow-800'
                                                                        : 'bg-green-100 text-green-800';

                                                        return (
                                                            <td
                                                                key={t.id}
                                                                className="py-2 text-right"
                                                            >
                                                                {pts !== null ? (
                                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipCls}`}>
                                                                        {pts}
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="py-2 pl-3 text-right">
                                                        <div className="inline-flex items-center gap-1">
                                                            {/* Players-circle toggle button */}
                                                            <button
                                                                aria-expanded={activeCircleRound === round.round_number}
                                                                aria-label={`${activeCircleRound === round.round_number ? 'Hide' : 'Show'} seating circle for round ${round.round_number}`}
                                                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                                                                    activeCircleRound === round.round_number
                                                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                                        : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                                                                }`}
                                                                onClick={(e) => toggleCircle(e, round.round_number)}
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

                                                            {/* Scoring-detail expand/collapse button */}
                                                            <button
                                                                aria-expanded={expandedRound === round.round_number}
                                                                aria-label={`${expandedRound === round.round_number ? 'Collapse' : 'Expand'} round ${round.round_number} detail`}
                                                                className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setExpandedRound((prev) =>
                                                                        prev === round.round_number
                                                                            ? null
                                                                            : round.round_number,
                                                                    );
                                                                }}
                                                                type="button"
                                                            >
                                                                <svg
                                                                    aria-hidden="true"
                                                                    className={`h-4 w-4 transition-transform duration-200 ${
                                                                        expandedRound === round.round_number
                                                                            ? 'rotate-180'
                                                                            : ''
                                                                    }`}
                                                                    fill="currentColor"
                                                                    viewBox="0 0 20 20"
                                                                >
                                                                    <path
                                                                        clipRule="evenodd"
                                                                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                                                        fillRule="evenodd"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {expandedRound === round.round_number && (
                                                    <tr>
                                                        <td
                                                            className="pb-3 pt-0"
                                                            colSpan={teams.length + 2}
                                                        >
                                                            <div className="rounded-xl border border-indigo-100 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_60%),linear-gradient(135deg,_#eef2ff_0%,_#f8fafc_100%)] px-4 py-4">
                                                                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">
                                                                    Round {round.round_number} — Scoring Detail
                                                                </p>

                                                                {loadingDraftRound === round.round_number ? (
                                                                    <p className="text-xs text-slate-400">Loading detail…</p>
                                                                ) : (
                                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                        {teams.map((t) => {
                                                                            const draft = roundDraftCache[round.round_number];
                                                                            const draftBase = draft?.base_inputs?.[t.id] ?? draft?.base_inputs?.[String(t.id)] ?? {};
                                                                            const draftCards = draft?.card_inputs?.[t.id] ?? draft?.card_inputs?.[String(t.id)] ?? {};

                                                                            return (
                                                                                <div
                                                                                    key={t.id}
                                                                                    className="rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm"
                                                                                >
                                                                                    <div className="mb-3 flex items-center justify-between gap-2">
                                                                                        <p className="text-xs font-semibold text-indigo-500">
                                                                                            {t.name}
                                                                                        </p>
                                                                                        {(() => {
                                                                                            const rs = round.scores.find((sc) => sc.team_id === t.id);
                                                                                            const otherRs = round.scores.find((sc) => sc.team_id !== t.id);
                                                                                            const pts = rs ? rs.points : null;
                                                                                            const otherPts = otherRs ? otherRs.points : null;
                                                                                            const bothPos = pts !== null && pts > 0 && otherPts !== null && otherPts > 0;
                                                                                            const chipCls = pts === null
                                                                                                ? ''
                                                                                                : pts < 0
                                                                                                    ? 'bg-red-100 text-red-800'
                                                                                                    : pts === 0
                                                                                                        ? 'bg-[bisque] text-green-700'
                                                                                                        : bothPos && pts < otherPts
                                                                                                            ? 'bg-yellow-100 text-yellow-800'
                                                                                                            : 'bg-green-100 text-green-800';
                                                                                            return pts !== null ? (
                                                                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipCls}`}>
                                                                                                    {pts}
                                                                                                </span>
                                                                                            ) : null;
                                                                                        })()}
                                                                                    </div>

                                                                                    {draft === null || elements.length === 0 ? (
                                                                                        <p className="text-xs italic text-slate-400">
                                                                                            No scoring detail captured for this round.
                                                                                        </p>
                                                                                    ) : (
                                                                                        <BaseElementsInput
                                                                                            cardsInHand={draftCards.cardsInHand ?? 0}
                                                                                            cardsOnTable={draftCards.cardsOnTable ?? 0}
                                                                                            elements={elements}
                                                                                            readOnly
                                                                                            teamId={`hist-${round.round_number}-${t.id}`}
                                                                                            values={draftBase}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* Player-circle panel — rendered while open or animating closed */}
                                                {(activeCircleRound === round.round_number || closingCircleRound === round.round_number) && (
                                                    <tr>
                                                        <td
                                                            className="pb-4 pt-0"
                                                            colSpan={teams.length + 2}
                                                        >
                                                            <div className="flex justify-center overflow-visible">
                                                                <PlayerCircle
                                                                    buttonRect={circleButtonRect}
                                                                    isOpen={activeCircleRound === round.round_number}
                                                                    players={teams.flatMap((t) => t.players)}
                                                                    roundNumber={round.round_number}
                                                                    roundRoles={
                                                                        roundRoles.find(
                                                                            (r) => Number(r.round_number) === round.round_number,
                                                                        ) ?? null
                                                                    }
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
