import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';

/**
 * Renders a list of base scoring elements for one team with the appropriate input control per element:
 * - boolean elements show a checkbox
 * - quantity elements show a numeric input
 * A computed total is displayed at the bottom of the list.
 *
 * @param {Object[]} elements   - Base element objects from the API ({ id, name, label, points, input_type }).
 * @param {number}   teamId     - Team identifier; used to generate unique input IDs when multiple teams are shown.
 * @param {Object}   values     - Map of { [elementId]: boolean | number } representing the current inputs.
 * @param {Function} onChange   - Callback (elementId: number, value: boolean | number) called on every input change.
 * @param {Object}   errors     - Map of { [elementId]: string } validation error messages for quantity fields.
 */
export default function BaseElementsInput({ elements, teamId, values = {}, onChange, errors = {} }) {
    const total = elements.reduce((sum, el) => {
        const raw = values[el.id];

        if (el.input_type === 'boolean') {
            return sum + (raw ? el.points : 0);
        }

        return sum + el.points * (parseInt(raw, 10) || 0);
    }, 0);

    return (
        <div className="space-y-2">
            {elements.map((el) => {
                const inputId = `team-${teamId}-el-${el.id}`;
                const isBoolean = el.input_type === 'boolean';

                return (
                    <div key={el.id} className="space-y-0.5">
                        <div className="flex items-center gap-3">
                            {isBoolean ? (
                                <Checkbox
                                    checked={!!values[el.id]}
                                    id={inputId}
                                    onChange={(e) => onChange(el.id, e.target.checked)}
                                />
                            ) : (
                                <input
                                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                                    id={inputId}
                                    min="0"
                                    onChange={(e) => onChange(el.id, e.target.value)}
                                    step="1"
                                    type="number"
                                    value={values[el.id] ?? 0}
                                />
                            )}

                            <InputLabel
                                className="flex-1 cursor-pointer select-none"
                                htmlFor={inputId}
                                value={el.label}
                            />

                            <span className="shrink-0 text-xs text-slate-400">
                                {isBoolean
                                    ? `${el.points.toLocaleString()} pts`
                                    : `×${el.points.toLocaleString()} pts`}
                            </span>
                        </div>

                        {errors[el.id] && (
                            <InputError message={errors[el.id]} />
                        )}
                    </div>
                );
            })}

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-slate-500">Score</span>
                <span className="text-base font-semibold text-slate-900">
                    {total.toLocaleString()} pts
                </span>
            </div>
        </div>
    );
}
