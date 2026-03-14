import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';

/**
 * Renders a list of base scoring elements for one team with the appropriate input control per element:
 * - boolean elements show a checkbox
 * - quantity elements show a numeric input
 * Two additional fields for cards held in hand (subtracted from the total) and cards laid on the
 * table (added to the total) are appended after the base elements list.
 * A computed total is displayed at the bottom unless readOnly is true.
 *
 * @param {Object[]} elements      - Base element objects from the API ({ id, name, label, points, input_type }).
 * @param {number}   teamId        - Team identifier; used to generate unique input IDs when multiple teams are shown.
 * @param {Object}   values        - Map of { [elementId]: boolean | number } representing the current element inputs.
 * @param {Function} onChange      - Callback (elementId: number, value: boolean | number) called on every element change.
 * @param {Object}   errors        - Map of { [elementId]: string } validation error messages for quantity fields.
 * @param {number}   cardsInHand   - Total points of cards still in hand; subtracted from the running total.
 * @param {number}   cardsOnTable  - Total points of cards laid on the table; added to the running total.
 * @param {Function} onCardsChange - Callback (field: 'cardsInHand' | 'cardsOnTable', value: string) fired on card input change.
 * @param {Object}   cardErrors    - Validation messages: { cardsInHand?: string, cardsOnTable?: string }.
 * @param {boolean}  readOnly      - When true all inputs are disabled, errors are hidden, and the total row is omitted.
 */
export default function BaseElementsInput({ elements, teamId, values = {}, onChange, errors = {}, cardsInHand = 0, cardsOnTable = 0, onCardsChange, cardErrors = {}, readOnly = false }) {
    // When a score_override boolean element is checked both cardsInHand and
    // cardsOnTable are subtracted from the base score (penalty mode).
    const scoreOverrideActive = elements.some((el) => el.score_override && !!values[el.id]);

    // Cards on table is subtracted (negative) when all scoring canastras are zero OR
    // when a score_override element is active.
    const canastrasAllZero = elements
        .filter((el) => el.name.includes('canastra') && !el.score_override)
        .every((el) => {
            const val = values[el.id];

            return el.input_type === 'boolean' ? !val : (parseInt(val, 10) || 0) === 0;
        });

    const cardsOnTableNegative = scoreOverrideActive || canastrasAllZero;

    const baseTotal = elements.reduce((sum, el) => {
        const raw = values[el.id];

        if (el.input_type === 'boolean') {
            return sum + (raw ? el.points : 0);
        }

        return sum + el.points * (parseInt(raw, 10) || 0);
    }, 0);

    const inHand = parseInt(cardsInHand, 10) || 0;
    const onTable = parseInt(cardsOnTable, 10) || 0;

    // scoreOverrideActive is already captured in cardsOnTableNegative, so a single
    // formula handles both cases: onTable is subtracted whenever the flag is active.
    const total = baseTotal - inHand + (cardsOnTableNegative ? -onTable : onTable);

    const booleanEls = elements.filter((el) => el.input_type === 'boolean');
    const quantityEls = elements.filter((el) => el.input_type === 'quantity');

    const renderElement = (el) => {
        const inputId = `team-${teamId}-el-${el.id}`;
        const isBoolean = el.input_type === 'boolean';

        return (
            <div key={el.id} className="space-y-0.5">
                <div className="flex items-center gap-3">
                    {isBoolean ? (
                        <Checkbox
                            checked={!!values[el.id]}
                            disabled={readOnly}
                            id={inputId}
                            onChange={readOnly ? undefined : (e) => onChange(el.id, e.target.checked)}
                        />
                    ) : (
                        <input
                            className={`w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 focus:outline-none${readOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                            disabled={readOnly}
                            id={inputId}
                            min="0"
                            onChange={readOnly ? undefined : (e) => onChange(el.id, e.target.value)}
                            readOnly={readOnly}
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
                        {el.points === 0
                            ? 'VOID'
                            : isBoolean
                                ? `${el.points.toLocaleString()} pts`
                                : `×${el.points.toLocaleString()} pts`}
                    </span>
                </div>

                {!readOnly && errors[el.id] && (
                    <InputError message={errors[el.id]} />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-2">
            {booleanEls.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Check Achievements</p>
                    {booleanEls.map(renderElement)}
                </div>
            )}

            {quantityEls.length > 0 && (
                <div className={`space-y-2 ${booleanEls.length > 0 ? 'mt-3 border-t border-slate-100 pt-3' : ''}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quantity</p>
                    {quantityEls.map(renderElement)}
                </div>
            )}

            <div className="mt-1 space-y-2 border-t border-dashed border-slate-200 pt-2">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-3">
                        <input
                            className={`w-16 rounded-lg border border-rose-200 bg-white px-2 py-1 text-right text-sm text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200${readOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                            disabled={readOnly}
                            id={`team-${teamId}-cards-in-hand`}
                            min="0"
                            onChange={readOnly ? undefined : (e) => onCardsChange?.('cardsInHand', e.target.value)}
                            readOnly={readOnly}
                            step="1"
                            type="number"
                            value={cardsInHand}
                        />
                        <InputLabel
                            className="flex-1 cursor-pointer select-none"
                            htmlFor={`team-${teamId}-cards-in-hand`}
                            value="Cards in Hand"
                        />
                        <span className="shrink-0 text-xs font-medium text-rose-500">−pts</span>
                    </div>
                    {!readOnly && cardErrors.cardsInHand && (
                        <InputError message={cardErrors.cardsInHand} />
                    )}
                </div>

                <div className="space-y-0.5">
                    <div className="flex items-center gap-3">
                        <input
                            className={`w-16 rounded-lg border bg-white px-2 py-1 text-right text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${cardsOnTableNegative ? 'border-rose-200 focus:border-rose-400 focus:ring-rose-200' : 'border-emerald-200 focus:border-emerald-400 focus:ring-emerald-200'}${readOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                            disabled={readOnly}
                            id={`team-${teamId}-cards-on-table`}
                            min="0"
                            onChange={readOnly ? undefined : (e) => onCardsChange?.('cardsOnTable', e.target.value)}
                            readOnly={readOnly}
                            step="1"
                            type="number"
                            value={cardsOnTable}
                        />
                        <InputLabel
                            className="flex-1 cursor-pointer select-none"
                            htmlFor={`team-${teamId}-cards-on-table`}
                            value="Cards on Table"
                        />
                        <span className={`shrink-0 text-xs font-medium ${cardsOnTableNegative ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {cardsOnTableNegative ? '−pts' : '+pts'}
                        </span>
                    </div>
                    {!readOnly && cardErrors.cardsOnTable && (
                        <InputError message={cardErrors.cardsOnTable} />
                    )}
                </div>
            </div>

            {!readOnly && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-sm font-medium text-slate-500">Score</span>
                    <span className="text-base font-semibold text-slate-900">
                        {total.toLocaleString()} pts
                    </span>
                </div>
            )}
        </div>
    );
}
