import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';

/**
 * Dialog for extending a finished game by setting a new match-points goal.
 *
 * @param {boolean}  props.isOpen        - Whether the modal is visible.
 * @param {function} props.onClose       - Called to request the modal to close.
 * @param {object}   props.game          - The finished game object (used to show the current target).
 * @param {string}   props.targetPoints  - Controlled input value for the new goal.
 * @param {object}   props.errors        - Validation errors: { target_points?, general? }.
 * @param {boolean}  props.isExtending   - Disables controls while the API call is in flight.
 * @param {function} props.onChange      - (value: string) => void — updates parent targetPoints state.
 * @param {function} props.onSubmit      - Form submit handler (receives the SyntheticEvent).
 * @return {JSX.Element}
 *
 * Logic: Purely presentational — all state is owned by GameCard. The current target_points is
 * shown as a hint so the creator knows what the bar was previously set at.
 */
export default function ExtendGameModal({ isOpen, onClose, game, targetPoints, errors, isExtending, onChange, onSubmit }) {
    return (
        <Modal maxWidth="lg" onClose={onClose} show={isOpen}>
            <form className="space-y-6 p-6" onSubmit={onSubmit}>
                <div className="space-y-2">
                    <h4 className="text-lg font-semibold text-slate-900">
                        Extend game
                    </h4>
                    <p className="text-sm text-slate-600">
                        Set a new match-points goal to reopen the game and let players continue from
                        their current scores.
                        {game?.target_points != null && (
                            <span className="ml-1 font-medium text-slate-700">
                                Current goal: {game.target_points} pts.
                            </span>
                        )}
                    </p>
                </div>

                <div className="space-y-2">
                    <InputLabel htmlFor="extend-game-target-points" value="New winning score" />
                    <TextInput
                        autoFocus
                        className="block w-full rounded-xl"
                        id="extend-game-target-points"
                        min="1"
                        onChange={(event) => onChange(event.target.value)}
                        step="1"
                        type="number"
                        value={targetPoints}
                    />
                    <InputError message={errors.target_points} />
                </div>

                <InputError message={errors.general} />

                <div className="flex items-center justify-end gap-3">
                    <SecondaryButton
                        disabled={isExtending}
                        onClick={onClose}
                        type="button"
                    >
                        Cancel
                    </SecondaryButton>
                    <PrimaryButton disabled={isExtending} type="submit">
                        {isExtending ? 'Extending…' : 'Extend'}
                    </PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
