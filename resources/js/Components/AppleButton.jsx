/**
 * AppleButton
 *
 * A standalone button that redirects the browser to the Apple Sign In
 * authorisation endpoint. Renders the Apple logo alongside a label so
 * the purpose is immediately clear to the user.
 *
 * @param {string} [className=''] - Additional Tailwind classes.
 * @returns {JSX.Element}
 */
export default function AppleButton({ className = '' }) {
    return (
        <a
            href={route('auth.apple.redirect')}
            className={
                `inline-flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition duration-150 ease-in-out hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${className}`
            }
        >
            {/* Apple logo */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 814 1000"
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
                fill="currentColor"
            >
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 672.4 0 565.7 0 464.5 0 255.7 133.9 145.2 265 145.2c61.7 0 113.3 40.8 151.8 40.8 36.9 0 95.1-43 163.8-43 26.3 0 108.2 2.6 168.4 79.3zm-127.9-174.2c30.9-36.9 52.8-88.2 52.8-139.5 0-7.1-.6-14.3-1.9-20.1-50.1 1.9-110.3 33.4-146.4 75.5-28.3 32.1-55.1 83.4-55.1 135.4 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.1-70.7z" />
            </svg>
            Continue with Apple
        </a>
    );
}
