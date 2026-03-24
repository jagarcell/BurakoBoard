import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import GameCard from '@/Components/GameCard';
import PlayerOrderCard from '@/Components/PlayerOrderCard';
import RoundsCard from '@/Components/RoundsCard';
import TeamsCard from '@/Components/TeamsCard';
import useConfetti from '@/hooks/useConfetti';
import useWinnerSound from '@/hooks/useWinnerSound';

export default function Dashboard() {
    const [preselectedGameId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('game') ?? null;
    });

    const [selectedGame, setSelectedGame] = useState(null);
    const [gameSummary, setGameSummary] = useState(null);
    const [scoreUpdate, setScoreUpdate] = useState(null);
    const [isFetching, setIsFetching] = useState(false);

    const { unlock: unlockBadgeSound, play: playBadgeSound } = useWinnerSound();
    const { fire: fireConfetti, burst: burstConfetti } = useConfetti();

    const handleWinnerBadgeClick = useCallback(() => {
        unlockBadgeSound();
        playBadgeSound();
        burstConfetti();
    }, [unlockBadgeSound, playBadgeSound, burstConfetti]);

    const handleTeamsChange = (newTeams, nextSummary = null) => {
        if (nextSummary) {
            setGameSummary(nextSummary);

            return;
        }

        setGameSummary((prev) => (prev ? { ...prev, teams: newTeams } : prev));
    };

    const handleRoundRecorded = (updatedTeams, gameStatus, nextSummary = null) => {
        setScoreUpdate(updatedTeams);

        if (nextSummary) {
            setGameSummary(nextSummary);
        }

        if (gameStatus) {
            setSelectedGame((prev) => (prev ? { ...prev, status: gameStatus } : prev));
        }
        if (gameStatus === 'finished') {
            fireConfetti();
        }
    };

    useEffect(() => {
        if (! selectedGame) {
            setGameSummary(null);
            setScoreUpdate(null);
            setIsFetching(false);

            return;
        }

        setIsFetching(true);
        let isActive = true;

        axios
            .get(`/api/v1/games/${selectedGame.id}`)
            .then((response) => {
                if (! isActive) return;

                const summary = response.data?.data?.game ?? {};
                const teams = summary.teams ?? [];

                setGameSummary({
                    game: summary.game ?? null,
                    teams,
                    rounds: summary.rounds ?? [],
                    round_roles: summary.round_roles ?? [],
                });
                setIsFetching(false);
                setScoreUpdate(null);
            })
            .catch(() => {
                if (! isActive) return;

                setGameSummary({ game: null, teams: [], rounds: [], round_roles: [] });
                setIsFetching(false);
            });

        return () => {
            isActive = false;
        };
    }, [selectedGame?.id]);

    const initialTeams = useMemo(() => gameSummary?.teams ?? [], [gameSummary]);
    const initialRounds = useMemo(() => gameSummary?.rounds ?? [], [gameSummary]);
    const initialRoundRoles = useMemo(() => gameSummary?.round_roles ?? [], [gameSummary]);

    // Subscribe to real-time game-state updates broadcast by other users in this game.
    // Covers team changes, player order changes, and new rounds recorded by co-players.
    useEffect(() => {
        if (! selectedGame?.id || typeof window === 'undefined' || ! window.Echo) return;

        const echo = window.Echo;

        echo.private(`game.${selectedGame.id}`)
            .listen('.game.updated', ({ game, teams, rounds, round_roles }) => {
                setGameSummary({ game, teams, rounds, round_roles });
                if (game) {
                    setSelectedGame((prev) => {
                        if (prev && game.status === 'finished' && prev.status !== 'finished') {
                            fireConfetti();
                        }

                        return prev ? { ...prev, status: game.status, current_round_number: game.current_round_number } : prev;
                    });
                }
            });

        return () => {
            echo.leave(`game.${selectedGame.id}`);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGame?.id]);

    const hasTwoTeams = useMemo(() => {
        if (initialTeams.length < 2) return false;

        return initialTeams[0].players.length === initialTeams[1].players.length;
    }, [initialTeams]);

    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Dashboard
                </h2>
            }
        >
            <Head title="Dashboard" />

            <div className="bg-slate-100 py-12">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <GameCard onGameSelect={setSelectedGame} preselectedGameId={preselectedGameId} />

                    <TeamsCard
                        gameSummary={gameSummary}
                        initialTeams={initialTeams}
                        isFetching={isFetching}
                        onTeamsChange={handleTeamsChange}
                        onWinnerBadgeClick={handleWinnerBadgeClick}
                        scoreUpdate={scoreUpdate}
                        selectedGame={selectedGame}
                    />

                    <PlayerOrderCard
                        gameSummary={gameSummary}
                        onTeamsChange={handleTeamsChange}
                        selectedGame={selectedGame}
                        teams={initialTeams}
                    />

                    <RoundsCard
                        hasTwoTeams={hasTwoTeams}
                        initialRounds={initialRounds}
                        roundRoles={initialRoundRoles}
                        initialTeams={initialTeams}
                        isFetching={isFetching}
                        onRoundRecorded={handleRoundRecorded}
                        selectedGame={selectedGame}
                    />
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
