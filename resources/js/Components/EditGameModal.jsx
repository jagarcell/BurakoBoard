import DangerButton from '@/Components/DangerButton';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

/**
 * Controlled modal for renaming a game, updating its target score, or deleting it.
 *
 * @param {boolean}  props.isOpen      - Whether the modal is visible.
 * @param {function} props.onClose     - Called to request the modal to close.
 * @param {object}   props.game        - The currently selected game object (used to guard the Delete button).
 * @param {object}   props.form        - Controlled form state: { name, targetPoints }.
 * @param {object}   props.errors      - Validation errors: { name?, target_points?, general? }.
 * @param {boolean}  props.isSaving    - Disables controls while the save call is in flight.
 * @param {boolean}  props.isDeleting  - Disables controls while the delete call is in flight.
 * @param {function} props.onChange    - (field: string, value: string) => void — updates parent form state.
 * @param {function} props.onSubmit    - Form submit handler (receives the SyntheticEvent).
 * @param {function} props.onDelete    - Called when the Delete button is clicked.
 * @return {JSX.Element}
 *
 * Logic: Purely presentational — all state is owned by GameCard. The Delete button is only
 * rendered when the caller is the game creator AND no rounds have been recorded yet
 * (current_round_number === 0), preventing accidental deletion of games in progress.
 */
export default function EditGameModal({ isOpen, onClose, game, form, errors, isSaving, isDeleting, onChange, onSubmit, onDelete }) {
    return (
        <Modal maxWidth="lg" onClose={onClose} show={isOpen}>
            <form className="space-y-6 p-6" onSubmit={onSubmit}>
                <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-slate-900">
                        Edit game
                    </h4>
                    <p className="text-sm text-slate-600">
                        Update the game name and the score required to declare a winner.
                    </p>
                </div>

                <div className="space-y-2">
                    <InputLabel htmlFor="edit-game-name" value="Game name" />
                    <TextInput
                        className="block w-full rounded-xl"
                        id="edit-game-name"
                        isFocused
                        onChange={(event) => onChange('name', event.target.value)}
                        placeholder="Friday Burako"
                        value={form.name}
                    />
                    <InputError message={errors.name} />
                </div>

                <div className="space-y-2">
                    <InputLabel htmlFor="edit-game-target-points" value="Winning score" />
                    <TextInput
                        className="block w-full rounded-xl"
                        id="edit-game-target-points"
                        min="1"
                        onChange={(event) => onChange('targetPoints', event.target.value)}
                        step="1"
                        type="number"
                        value={form.targetPoints}
                    />
                    <InputError message={errors.target_points} />
                </div>

                <InputError message={errors.general} />

                <div className="flex items-center gap-3">
                    {game?.user_role === 'creator' && (game?.current_round_number ?? 1) === 0 && (
                        <DangerButton
                            disabled={isSaving || isDeleting}
                            onClick={onDelete}
                            type="button"
                        >
                            {isDeleting ? 'Deleting…' : 'Delete'}
                        </DangerButton>
                    )}

                    <div className="ml-auto flex gap-3">
                        <SecondaryButton
                            disabled={isSaving || isDeleting}
                            onClick={onClose}
                            type="button"
                        >
                            Cancel
                        </SecondaryButton>
                        <PrimaryButton disabled={isSaving || isDeleting} type="submit">
                            Save
                        </PrimaryButton>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
