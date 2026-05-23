import { useState, lazy, Suspense } from 'react';
import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import NumericStepper from '@/Components/NumericStepper';

const CardPointsScanner = lazy(() => import('@/Components/CardPointsScanner'));

/**
 * Renders a list of base scoring elements for one team with the appropriate input control per element:
 * - boolean elements show a checkbox
 * - quantity elements show a numeric input
 * Two additional fields for cards held in hand (subtracted from the total) and cards laid on the
 * table (added to the total) are appended after the base elements list.
 * A computed total is displayed at the bottom unless readOnly is true.
 *
 * @param {Object[]} elements      - Base element objects from the API ({ id, name, label, points, penalty, input_type }).
 * @param {number}   teamId        - Team identifier; used to generate unique input IDs when multiple teams are shown.
 * @param {Object}   values        - Map of { [elementId]: boolean | number } representing the current element inputs.
 * @param {Function} onChange      - Callback (elementId: number, value: boolean | number) called on every element change.
 * @param {Object}   errors        - Map of { [elementId]: string } validation error messages for quantity fields.
 * @param {number}   cardsInHand   - Total points of cards still in hand; subtracted from the running total.
 * @param {number}   cardsOnTable  - Total points of cards laid on the table; added to the running total.
 * @param {Function} onCardsChange - Callback (field: 'cardsInHand' | 'cardsOnTable', value: string) fired on card input change.
 * @param {Object}   cardErrors       - Validation messages: { cardsInHand?: string, cardsOnTable?: string }.
 * @param {boolean}  readOnly         - When true all inputs are disabled, errors are hidden, and the total row is omitted.
 * @param {boolean}  showBaseElements - When false, all input sections (Check Achievements, Quantity,
 *                                      and Cards) are hidden; only the Score total remains visible.
 *
 * Logic: When an element has a non-zero `penalty` value and is not active (boolean unchecked or
 * quantity = 0), the points slot displays the penalty as a negative score (e.g. −100 pts) in
 * rose/red text, giving the user a visual cue that a deduction will be applied.
 */
export default function BaseElementsInput({ elements, teamId, values = {}, onChange, errors = {}, cardsInHand = 0, cardsOnTable = 0, onCardsChange, cardErrors = {}, readOnly = false, showBaseElements = true, amendedElementIds = [], amendedCardFields = {}, showCardScanner = true }) {
    const [scannerTarget, setScannerTarget] = useState(null);
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
            const isActive = !!raw;

            return sum + (isActive ? el.points : -(el.penalty ?? 0));
        }

        const qty = parseInt(raw, 10) || 0;

        return sum + (qty > 0 ? el.points * qty : -(el.penalty ?? 0));
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
        const isAmended = amendedElementIds.includes(el.id);

        // An element is "active" when its checkbox is checked (boolean) or its
        // quantity is greater than zero. When inactive and the element carries a
        // penalty, we surface the penalty as a negative score so the user can see
        // what deduction they are incurring.
        const isActive = isBoolean ? !!values[el.id] : (parseInt(values[el.id], 10) || 0) > 0;
        const showPenalty = (el.penalty ?? 0) > 0 && !isActive;

        return (
            <div key={el.id} className="space-y-0.5">
                <div className="flex items-center gap-3">
                    {isBoolean ? (
                        <Checkbox
                            checked={!!values[el.id]}
                            className={isAmended ? 'border-orange-400 text-orange-500 focus:ring-orange-400' : ''}
                            disabled={readOnly}
                            id={inputId}
                            onChange={readOnly ? undefined : (e) => onChange(el.id, e.target.checked)}
                        />
                    ) : (
                        <NumericStepper
                            disabled={readOnly}
                            id={inputId}
                            onChange={(val) => onChange(el.id, val)}
                            readOnly={readOnly}
                            value={values[el.id] ?? 0}
                            variant={isAmended ? 'amber' : 'default'}
                        />
                    )}

                    <InputLabel
                        className="flex-1 cursor-pointer select-none"
                        htmlFor={inputId}
                        value={el.label}
                    />

                    <span className={`shrink-0 text-xs ${showPenalty ? 'font-medium text-rose-500' : 'text-slate-400'}`}>
                        {showPenalty
                            ? `−${el.penalty.toLocaleString()} pts`
                            : el.points === 0
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
            {showBaseElements && booleanEls.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Check Achievements</p>
                    {booleanEls.map(renderElement)}
                </div>
            )}

            {showBaseElements && quantityEls.length > 0 && (
                <div className={`space-y-2 ${showBaseElements && booleanEls.length > 0 ? 'mt-3 border-t border-slate-100 pt-3' : ''}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quantity</p>
                    {quantityEls.map(renderElement)}
                </div>
            )}

            {showBaseElements && <div className="mt-1 space-y-2 border-t border-dashed border-slate-200 pt-2">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-3">
                        <NumericStepper
                            disabled={readOnly}
                            id={`team-${teamId}-cards-in-hand`}
                            onChange={(val) => onCardsChange?.('cardsInHand', val)}
                            readOnly={readOnly}
                            value={cardsInHand}
                            variant={amendedCardFields.cardsInHand ? 'amber' : 'rose'}
                        />
                        <InputLabel
                            className="flex-1 cursor-pointer select-none"
                            htmlFor={`team-${teamId}-cards-in-hand`}
                            value="Points in Hand"
                        />
                        <span className="shrink-0 text-xs font-medium text-rose-500">−pts</span>
                        {!readOnly && showCardScanner && (
                            <button
                                aria-label="Scan cards in hand"
                                className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                onClick={() => setScannerTarget('hand')}
                                type="button"
                            >
                                📷
                            </button>
                        )}
                    </div>
                    {!readOnly && cardErrors.cardsInHand && (
                        <InputError message={cardErrors.cardsInHand} />
                    )}
                </div>

                <div className="space-y-0.5">
                    <div className="flex items-center gap-3">
                        <NumericStepper
                            disabled={readOnly}
                            id={`team-${teamId}-cards-on-table`}
                            onChange={(val) => onCardsChange?.('cardsOnTable', val)}
                            readOnly={readOnly}
                            value={cardsOnTable}
                            variant={amendedCardFields.cardsOnTable ? 'amber' : (cardsOnTableNegative ? 'rose' : 'emerald')}
                        />
                        <InputLabel
                            className="flex-1 cursor-pointer select-none"
                            htmlFor={`team-${teamId}-cards-on-table`}
                            value="Points on Table"
                        />
                        <span className={`shrink-0 text-xs font-medium ${cardsOnTableNegative ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {cardsOnTableNegative ? '−pts' : '+pts'}
                        </span>
                        {!readOnly && showCardScanner && (
                            <button
                                aria-label="Scan cards on table"
                                className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                onClick={() => setScannerTarget('table')}
                                type="button"
                            >
                                📷
                            </button>
                        )}
                    </div>
                    {!readOnly && cardErrors.cardsOnTable && (
                        <InputError message={cardErrors.cardsOnTable} />
                    )}
                </div>
            </div>}

            {!readOnly && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs font-medium text-slate-400">Round Score:</span>
                    {(() => {
                        const chipCls = total < 0
                            ? 'bg-red-100 text-red-800'
                            : total === 0
                                ? 'bg-[bisque] text-green-700'
                                : 'bg-green-100 text-green-800';
                        return (
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipCls}`}
                                data-testid="current-round-score"
                            >
                                {total}
                            </span>
                        );
                    })()}
                    <span aria-hidden="true" className="sm:hidden inline-flex flex-shrink-0 w-6 h-6" />
                </div>
            )}

            {scannerTarget && (
                <Suspense fallback={null}>
                    <CardPointsScanner
                        label={scannerTarget === 'hand' ? 'Points in Hand' : 'Points on Table'}
                        onApply={(total) => {
                            onCardsChange?.(
                                scannerTarget === 'hand' ? 'cardsInHand' : 'cardsOnTable',
                                total,
                            );
                            setScannerTarget(null);
                        }}
                        onCancel={() => setScannerTarget(null)}
                    />
                </Suspense>
            )}
        </div>
    );
}
