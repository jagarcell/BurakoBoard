/**
 * GoogleButton
 *
 * A standalone button that redirects the browser to the Google OAuth
 * authorisation endpoint. Renders the Google "G" logo alongside a label so
 * the purpose is immediately clear to the user.
 *
 * @param {string} [className=''] - Additional Tailwind classes.
 * @returns {JSX.Element}
 */
export default function GoogleButton({ className = '' }) {
    return (
        <a
            href={route('auth.google.redirect')}
            className={
                `inline-flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition duration-150 ease-in-out hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${className}`
            }
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
            >
                <path
                    fill="#4285F4"
                    d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C315.9 102.9 285.6 88 248 88c-94.4 0-170.8 76.6-170.8 168S153.6 424 248 424c71.8 0 120.6-31.2 140.7-74.4H248v-85.6h235.3c2.3 12.7 3.7 25.8 3.7 38.4z"
                />
            </svg>
            Continue with Google
        </a>
    );
}
