/**
 * A numeric input with custom decrement (−) and increment (+) buttons that replace the
 * default browser spin arrows.
 *
 * @param {string}        id        - Native input id; used to associate a <label htmlFor="...">.
 * @param {number|string} value     - Controlled value passed to the underlying input.
 * @param {Function}      onChange  - Called with the new value as a string on every change.
 * @param {boolean}       disabled  - Disables all controls when true.
 * @param {boolean}       readOnly  - Makes all controls read-only when true.
 * @param {number}        min       - Minimum allowed value (default 0). Decrement is blocked at this limit.
 * @param {number}        step      - Amount added or subtracted on each button click (default 1).
 * @param {string}        variant   - Colour scheme for borders and focus ring: 'default' | 'rose' | 'emerald'.
 * @param {string}        className - Additional classes applied to the outer wrapper div.
 *
 * @return {JSX.Element}
 *
 * Logic: Renders a flex row: [− button][number input][+ button]. The native browser spin-button
 * arrows are suppressed via Tailwind `[appearance:textfield]` and webkit pseudo-element overrides.
 * Clicking − decrements the current value by `step`, clamped at `min`. Clicking + increments by
 * `step`. Both buttons are disabled when `disabled` or `readOnly` is true; the decrement button is
 * additionally disabled when the current value is already at `min`. The input remains type="number"
 * so that screen-reader label associations and keyboard input continue to work correctly.
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
        onChange(String(Math.max(min, current - step)));
    };

    const increment = () => {
        if (inactive) return;
        onChange(String(current + step));
    };

    const sharedBtn = `flex h-7 w-7 items-center justify-center border text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${v.btn}`;

    return (
        <div className={`flex items-center ${className}`}>
            <button
                aria-label="Decrease"
                className={`${sharedBtn} rounded-l-lg border-r-0`}
                disabled={inactive || current <= min}
                onClick={decrement}
                tabIndex={-1}
                type="button"
            >
                −
            </button>

            <input
                className={`h-7 w-10 border-y ${v.border} bg-white px-0 py-1 text-center text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${v.focus} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none${disabled ? ' cursor-not-allowed opacity-60' : ''}`}
                disabled={disabled}
                id={id}
                min={min}
                onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
                readOnly={readOnly}
                step={step}
                type="number"
                value={value}
            />

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
        </div>
    );
}
