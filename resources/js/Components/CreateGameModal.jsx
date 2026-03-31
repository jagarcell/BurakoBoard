import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

/**
 * Controlled modal for creating a new game or starting a rematch.
 *
 * @param {boolean}  props.isOpen      - Whether the modal is visible.
 * @param {function} props.onClose     - Called to request the modal to close.
 * @param {boolean}  props.isRematch   - When true, shows rematch copy instead of create copy.
 * @param {object}   props.form        - Controlled form state: { name, targetPoints }.
 * @param {object}   props.errors      - Validation errors: { name?, target_points?, general? }.
 * @param {boolean}  props.isSaving    - Disables controls while the API call is in flight.
 * @param {function} props.onChange    - (field: string, value: string) => void — updates parent form state.
 * @param {function} props.onSubmit    - Form submit handler (receives the SyntheticEvent).
 * @return {JSX.Element}
 *
 * Logic: Purely presentational — all state is owned by GameCard and threaded in as props.
 * Renders the game-name and winning-score fields, delegates submit to onSubmit, and
 * displays per-field and general validation errors from the errors prop.
 */
export default function CreateGameModal({ isOpen, onClose, isRematch, form, errors, isSaving, onChange, onSubmit }) {
    return (
        <Modal maxWidth="lg" onClose={onClose} show={isOpen}>
            <form className="space-y-6 p-6" onSubmit={onSubmit}>
                <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-slate-900">
                        {isRematch ? 'Start a rematch' : 'Create a new game'}
                    </h4>
                    <p className="text-sm text-slate-600">
                        {isRematch
                            ? 'Adjust the game name and winning score if needed. The same teams and player order will carry over.'
                            : 'Enter the game name and the score required to declare a winner.'}
                    </p>
                </div>

                <div className="space-y-2">
                    <InputLabel htmlFor="new-game-name" value="Game name" />
                    <TextInput
                        className="block w-full rounded-xl"
                        id="new-game-name"
                        isFocused
                        onChange={(event) => onChange('name', event.target.value)}
                        placeholder="Friday Burako"
                        value={form.name}
                    />
                    <InputError message={errors.name} />
                </div>

                <div className="space-y-2">
                    <InputLabel htmlFor="new-game-target-points" value="Winning score" />
                    <TextInput
                        className="block w-full rounded-xl"
                        id="new-game-target-points"
                        min="1"
                        onChange={(event) => onChange('targetPoints', event.target.value)}
                        step="1"
                        type="number"
                        value={form.targetPoints}
                    />
                    <InputError message={errors.target_points} />
                </div>

                <InputError message={errors.general} />

                <div className="flex justify-end gap-3">
                    <SecondaryButton disabled={isSaving} onClick={onClose} type="button">
                        Cancel
                    </SecondaryButton>
                    <PrimaryButton disabled={isSaving} type="submit">
                        {isSaving ? 'Saving…' : isRematch ? 'Start Rematch' : 'Accept'}
                    </PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
