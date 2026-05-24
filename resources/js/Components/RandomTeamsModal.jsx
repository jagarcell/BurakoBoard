import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

const slots = [0, 1, 2, 3, 4, 5];

/**
 * Modal for creating two random teams from a user-provided player list.
 *
 * @param {boolean} props.isOpen - Whether the modal is visible.
 * @param {boolean} props.isCreating - Whether the create request is in-flight.
 * @param {string[]} props.playerNames - Array of up to six player names.
 * @param {number[]} props.duplicateIndexes - Input indexes with duplicate names.
 * @param {string} props.error - General validation or API error text.
 * @param {() => void} props.onClose - Called when the user cancels/closes.
 * @param {() => void} props.onCreate - Called when the user confirms creation.
 * @param {(index: number, value: string) => void} props.onPlayerNameChange - Called when a name input changes.
 * @return {JSX.Element}
 * Logic: renders six optional name inputs and delegates all state mutations to the parent component,
 * keeping this modal purely presentational and easy to unit test.
 */
export default function RandomTeamsModal({
    isOpen,
    isCreating,
    playerNames,
    duplicateIndexes = [],
    error,
    onClose,
    onCreate,
    onPlayerNameChange,
}) {
    const duplicateIndexSet = new Set(duplicateIndexes);

    const handleClose = () => {
        if (isCreating) return;
        onClose();
    };

    return (
        <Modal maxWidth="lg" onClose={handleClose} show={isOpen}>
            <div className="space-y-6 p-6">
                <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-slate-900">Create random teams (optional)</h4>
                    <p className="text-sm text-slate-600">
                        Enter 4 or 6 players. We will split them randomly into two teams.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {slots.map((slot) => (
                        <div className="space-y-1" key={slot}>
                            <InputLabel htmlFor={`random-player-${slot}`} value={`Player ${slot + 1}`} />
                            <TextInput
                                aria-invalid={duplicateIndexSet.has(slot)}
                                className={`block w-full rounded-xl ${duplicateIndexSet.has(slot) ? 'border-rose-500 bg-rose-50 focus:border-rose-500 focus:ring-rose-500' : ''}`}
                                id={`random-player-${slot}`}
                                onChange={(event) => onPlayerNameChange(slot, event.target.value)}
                                placeholder={`Player ${slot + 1} name`}
                                value={playerNames[slot] ?? ''}
                            />
                        </div>
                    ))}
                </div>

                <InputError message={error} role="alert" />

                <div className="flex justify-end gap-3">
                    <SecondaryButton disabled={isCreating} onClick={handleClose} type="button">
                        Cancel
                    </SecondaryButton>
                    <PrimaryButton disabled={isCreating} onClick={onCreate} type="button">
                        Create
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
