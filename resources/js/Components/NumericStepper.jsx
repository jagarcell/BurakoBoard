import { useRef, useState } from 'react';

/**
 * A numeric input with custom decrement (−) and increment (+) buttons that replace the
 * default browser spin arrows.
 *
 * @param {string}        id        - Native input id; used to associate a <label htmlFor="...">.
 * @param {number|string} value     - Controlled value passed to the underlying input.
 * @param {Function}      onChange  - Called with the new value as a string on every change.
 * @param {boolean}       disabled  - Disables all controls when true.
 * @param {boolean}       readOnly  - When true the − and + buttons are hidden and the input becomes read-only; only the value is shown.
 * @param {number}        min       - Minimum allowed value (default 0). Decrement is blocked at this limit.
 * @param {number}        step      - Amount added or subtracted on each button click (default 1).
 * @param {string}        variant   - Colour scheme for borders and focus ring: 'default' | 'rose' | 'emerald'.
 * @param {string}        className - Additional classes applied to the outer wrapper div.
 *
 * @return {JSX.Element}
 *
 * Logic: Renders a flex row: [− button][number input][+ button]. When `readOnly` is true the two
 * buttons are not rendered and the input gets a full border with rounded corners so it stands alone
 * as a plain display value. The native browser spin-button
 * arrows are suppressed via Tailwind `[appearance:textfield]` and webkit pseudo-element overrides.
 * Clicking − decrements the current value by `step`, clamped at `min`. Clicking + increments by
 * `step`. Both buttons are disabled when `disabled` or `readOnly` is true; the decrement button is
 * additionally disabled when the current value is already at `min`. The input remains type="number"
 * so that screen-reader label associations and keyboard input continue to work correctly.
 *
 * Mobile touch-edit mode: when the user taps the input on a touch device, focus is intercepted to
 * enter a local edit mode — if the current value is 0 the field is cleared so typing can begin
 * immediately; otherwise the current value is shown for in-place editing. The onChange callback is
 * fired when the input loses focus; if blurred while empty the value is clamped to `min`.
 */
export default function NumericStepper({
    id,
    value,
    onChange,
    disabled = false,
    readOnly = false,
    min = 0,
    step = 1,
    variant = 'default',
    className = '',
}) {
    const current = parseInt(value, 10) || 0;

    // Ref to the underlying <input> element for cursor positioning in edit mode.
    const inputRef = useRef(null);
    // Touch-edit mode: tracks whether the last focus was initiated by a touch gesture.
    const touchRef = useRef(false);
    // localValue is non-null only while in touch-edit mode; it holds the intermediate string.
    const [localValue, setLocalValue] = useState(null);

    // Use localValue when in edit mode so the decrease-button disabled state stays accurate.
    const effectiveCurrent = localValue !== null ? (parseInt(localValue, 10) || 0) : current;

    const variantMap = {
        default: {
            border: 'border-slate-200',
            focus: 'focus:border-indigo-400 focus:ring-indigo-200',
            btn: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:hover:bg-slate-50',
        },
        rose: {
            border: 'border-rose-200',
            focus: 'focus:border-rose-400 focus:ring-rose-200',
            btn: 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:hover:bg-rose-50',
        },
        emerald: {
            border: 'border-emerald-200',
            focus: 'focus:border-emerald-400 focus:ring-emerald-200',
            btn: 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:hover:bg-emerald-50',
        },
    };

    const v = variantMap[variant] ?? variantMap.default;
    const inactive = disabled || readOnly;

    const decrement = () => {
        if (inactive) return;
        onChange(String(Math.max(min, effectiveCurrent - step)));
    };

    const increment = () => {
        if (inactive) return;
        onChange(String(effectiveCurrent + step));
    };

    /** Mark the next focus event as touch-initiated so handleFocus can enter edit mode. */
    const handleTouchStart = () => {
        if (!inactive) touchRef.current = true;
    };

    /** On touch-initiated focus: clear the field if value is 0, else keep it for in-place editing
     *  with the cursor positioned after the last digit. */
    const handleFocus = () => {
        if (!touchRef.current) return;
        touchRef.current = false;
        if (current === 0) {
            setLocalValue('');
        } else {
            const strVal = String(current);
            setLocalValue(strVal);
            // Position cursor at end; requires type='text' (set reactively) — schedule after paint.
            requestAnimationFrame(() => {
                inputRef.current?.setSelectionRange(strVal.length, strVal.length);
            });
        }
    };

    /** While in touch-edit mode update localValue; otherwise propagate directly to onChange. */
    const handleChange = (e) => {
        if (readOnly) return;
        if (localValue !== null) {
            setLocalValue(e.target.value);
        } else {
            onChange(e.target.value);
        }
    };

    /** Commit the edited value on blur; clamp to min if the field was left empty. */
    const handleBlur = () => {
        if (localValue === null) return;
        const committed = localValue === '' ? String(min) : localValue;
        onChange(committed);
        setLocalValue(null);
    };

    const sharedBtn = `flex h-7 w-7 items-center justify-center border text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${v.btn}`;

    return (
        <div className={`flex items-center ${className}`}>
            {!readOnly && (
                <button
                    aria-label="Decrease"
                    className={`${sharedBtn} rounded-l-lg border-r-0`}
                    disabled={inactive || effectiveCurrent <= min}
                    onClick={decrement}
                    tabIndex={-1}
                    type="button"
                >
                    −
                </button>
            )}

            <input
                className={`h-7 w-10 bg-white px-0 py-1 text-center text-sm text-slate-900 shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none${
                    readOnly
                        ? ` border ${v.border} rounded-lg`
                        : ` border-y ${v.border} focus:outline-none focus:ring-2 ${v.focus}`
                }${disabled ? ' cursor-not-allowed opacity-60' : ''}`}
                disabled={disabled}
                id={id}
                min={min}
                onBlur={readOnly ? undefined : handleBlur}
                onChange={readOnly ? undefined : handleChange}
                onFocus={handleFocus}
                onTouchStart={inactive ? undefined : handleTouchStart}
                readOnly={readOnly}
                ref={inputRef}
                step={step}
                type={localValue !== null ? 'text' : 'number'}
                {...(localValue !== null ? { inputMode: 'numeric' } : {})}
                value={localValue !== null ? localValue : value}
            />

            {!readOnly && (
                <button
                    aria-label="Increase"
                    className={`${sharedBtn} rounded-r-lg border-l-0`}
                    disabled={inactive}
                    onClick={increment}
                    tabIndex={-1}
                    type="button"
                >
                    +
                </button>
            )}
        </div>
    );
}
