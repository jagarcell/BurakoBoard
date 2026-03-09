import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import { useState } from 'react';
import GameCard from '@/Components/GameCard';

export default function Dashboard() {
    const [selectedGame, setSelectedGame] = useState(null);

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

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-6 py-4">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
                                Current Selection
                            </h3>
                        </div>

                        <div className="px-6 py-5 text-slate-700">
                            {selectedGame === null ? (
                                <p>Select a game or create one to start managing the dashboard.</p>
                            ) : (
                                <p>
                                    <span className="font-semibold text-slate-900">
                                        {selectedGame.name}
                                    </span>{' '}
                                    is selected with a winner target of{' '}
                                    <span className="font-semibold text-slate-900">
                                        {selectedGame.target_points}
                                    </span>{' '}
                                    points.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
