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
    const [hasTwoTeams, setHasTwoTeams] = useState(false);

    const handleTeamsChange = (newTeams) => {
        setGameSummary((prev) => (prev ? { ...prev, teams: newTeams } : prev));
    };

    const handleTeamCreated = () => {
        if (! selectedGame?.id) return;

        axios
            .get(`/api/v1/games/${selectedGame.id}/has-two-teams`)
            .then((response) => setHasTwoTeams(response.data?.data?.has_two_teams ?? false))
            .catch(() => {});
    };

    useEffect(() => {
        if (! selectedGame) {
            setGameSummary(null);
            setScoreUpdate(null);
            setIsFetching(false);
            setHasTwoTeams(false);

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
                    teams,
                    rounds: summary.rounds ?? [],
                });
                setHasTwoTeams(teams.length >= 2);
                setIsFetching(false);
                setScoreUpdate(null);
            })
            .catch(() => {
                if (! isActive) return;

                setGameSummary({ teams: [], rounds: [] });
                setHasTwoTeams(false);
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
                        onTeamCreated={handleTeamCreated}
                        onTeamsChange={handleTeamsChange}
                        scoreUpdate={scoreUpdate}
                        selectedGame={selectedGame}
                    />

                    <RoundsCard
                        hasTwoTeams={hasTwoTeams}
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
