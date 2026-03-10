import TeamActionButton from '@/Components/TeamActionButton';

/**
 * Slot selector for adding a team to a game.
 *
 * Shows a dropdown of all available (not-yet-added) teams. When the default
 * "Select a team" option is active a "Create team" button is shown; once an
 * existing team is selected the button label switches to "Add team".
 */
export default function TeamSlotSelector({
    allTeams,
    excludedTeamIds = [],
    selectedTeamId,
    onSelect,
    onCreateTeam,
    onAddTeam,
    disabled = false,
}) {
    const availableTeams = allTeams.filter(
        (t) => !excludedTeamIds.includes(t.id),
    );

    return (
        <div className="flex flex-wrap items-center gap-3">
            <select
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                onChange={(e) => onSelect(e.target.value)}
                value={selectedTeamId}
            >
                <option value="">Select a team</option>
                {availableTeams.map((team) => (
                    <option key={team.id} value={String(team.id)}>
                        {team.name}
                    </option>
                ))}
            </select>

            {selectedTeamId === '' ? (
                <TeamActionButton
                    disabled={disabled}
                    onClick={onCreateTeam}
                    type="button"
                >
                    Create team
                </TeamActionButton>
            ) : (
                <TeamActionButton
                    disabled={disabled}
                    onClick={onAddTeam}
                    type="button"
                >
                    Add team
                </TeamActionButton>
            )}
        </div>
    );
}
