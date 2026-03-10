import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamSlotSelector from '@/Components/TeamSlotSelector';

const mockTeams = [
    { id: 100, name: 'Old Team A', players: [] },
    { id: 101, name: 'Old Team B', players: [] },
];

describe('TeamSlotSelector', () => {
    it('renders a "Select a team" default option', () => {
        render(
            <TeamSlotSelector
                allTeams={[]}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        const select = screen.getByRole('combobox');
        expect(within(select).getByRole('option', { name: 'Select a team' })).toBeInTheDocument();
    });

    it('lists available teams as options', () => {
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        const select = screen.getByRole('combobox');
        expect(within(select).getByRole('option', { name: 'Old Team A' })).toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'Old Team B' })).toBeInTheDocument();
    });

    it('excludes teams whose ids are in excludedTeamIds', () => {
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                excludedTeamIds={[100]}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        const select = screen.getByRole('combobox');
        expect(within(select).queryByRole('option', { name: 'Old Team A' })).not.toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'Old Team B' })).toBeInTheDocument();
    });

    it('shows a "Create team" button when no team is selected', () => {
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        expect(screen.getByRole('button', { name: 'Create team' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add team' })).not.toBeInTheDocument();
    });

    it('shows an "Add team" button when an existing team is selected', () => {
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId="100"
            />,
        );

        expect(screen.getByRole('button', { name: 'Add team' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Create team' })).not.toBeInTheDocument();
    });

    it('calls onSelect when the dropdown value changes', async () => {
        const handleSelect = vi.fn();
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={handleSelect}
                selectedTeamId=""
            />,
        );

        await userEvent.selectOptions(screen.getByRole('combobox'), '100');
        expect(handleSelect).toHaveBeenCalledWith('100');
    });

    it('calls onCreateTeam when "Create team" button is clicked', async () => {
        const handleCreate = vi.fn();
        render(
            <TeamSlotSelector
                allTeams={[]}
                onAddTeam={vi.fn()}
                onCreateTeam={handleCreate}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));
        expect(handleCreate).toHaveBeenCalledTimes(1);
    });

    it('calls onAddTeam when "Add team" button is clicked', async () => {
        const handleAdd = vi.fn();
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                onAddTeam={handleAdd}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId="101"
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));
        expect(handleAdd).toHaveBeenCalledTimes(1);
    });

    it('disables both select and button when disabled prop is true', () => {
        render(
            <TeamSlotSelector
                allTeams={mockTeams}
                disabled
                onAddTeam={vi.fn()}
                onCreateTeam={vi.fn()}
                onSelect={vi.fn()}
                selectedTeamId=""
            />,
        );

        expect(screen.getByRole('combobox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Create team' })).toBeDisabled();
    });
});
