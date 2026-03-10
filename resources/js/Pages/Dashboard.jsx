import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import GameCard from '@/Components/GameCard';
import RoundsCard from '@/Components/RoundsCard';
import TeamsCard from '@/Components/TeamsCard';

export default function Dashboard() {
    const [selectedGame, setSelectedGame] = useState(null);
    const [gameSummary, setGameSummary] = useState(null);
    const [scoreUpdate, setScoreUpdate] = useState(null);
    const [isFetching, setIsFetching] = useState(false);

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

                setGameSummary({
                    teams: summary.teams ?? [],
                    rounds: summary.rounds ?? [],
                });
                setIsFetching(false);
                setScoreUpdate(null);
            })
            .catch(() => {
                if (! isActive) return;

                setGameSummary({ teams: [], rounds: [] });
                setIsFetching(false);
            });

        return () => {
            isActive = false;
        };
    }, [selectedGame?.id]);

    const initialTeams = useMemo(() => gameSummary?.teams ?? [], [gameSummary]);
    const initialRounds = useMemo(() => gameSummary?.rounds ?? [], [gameSummary]);

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
                    <GameCard onGameSelect={setSelectedGame} />

                    <TeamsCard
                        initialTeams={initialTeams}
                        isFetching={isFetching}
                        scoreUpdate={scoreUpdate}
                        selectedGame={selectedGame}
                    />

                    <RoundsCard
                        initialRounds={initialRounds}
                        initialTeams={initialTeams}
                        isFetching={isFetching}
                        onRoundRecorded={setScoreUpdate}
                        selectedGame={selectedGame}
                    />
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
