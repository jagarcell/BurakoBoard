import axios from 'axios';
import { router } from '@inertiajs/react';

/**
 * Pre-configured axios instance for all BurakoBoard API v1 calls.
 * Using this client instead of raw axios prevents the /api/v1 prefix from
 * being scattered across every call site, and makes base-URL changes or
 * interceptor additions a single-file operation.
 */
const api = axios.create({ baseURL: '/api/v1' });

/**
 * Destroy the server-side session, then navigate to /login.
 *
 * Logic:
 * - POST /logout is sent as a best-effort fire-and-forget via the base axios
 *   instance (not `api`) to avoid re-entering this interceptor. If the session
 *   is already gone or the CSRF token is stale the request will fail silently;
 *   the server session is already invalid in that case so nothing is lost.
 * - router.visit() is used instead of window.location.* because a plain
 *   location change lets React's MessageChannel scheduler fire deferred work
 *   against the partially-torn-down fiber tree, corrupting the update queue
 *   ("Cannot read properties of undefined (reading 'payload')"). router.visit()
 *   calls ReactDOM.flushSync() which drains all pending React work synchronously
 *   before swapping the component tree.
 * - A never-settling promise is returned so the calling code's .catch() is
 *   never reached and no stale error state is shown while navigating away.
 *
 * @return {Promise<never>}
 */
const redirectToLogin = () => {
    axios.post('/logout').catch(() => {});
    router.visit('/login', { replace: true });
    return new Promise(() => {});
};

/**
 * Intercept responses globally.
 *
 * 401 (Unauthenticated): the session has ended; redirect to /login immediately.
 *
 * 419 (CSRF token mismatch): the session cookie may still be valid but the
 * CSRF token has expired, which is common in long-lived SPA sessions where the
 * browser tab stays open for hours. In this case the correct recovery is to
 * refresh the token via GET /sanctum/csrf-cookie and replay the original
 * request once so the user action succeeds transparently. Only redirect to
 * /login when the refresh call itself fails (server unavailable / session truly
 * gone) or when the retry also returns 401/419.
 *
 * A never-settling promise is returned on any redirect so the calling code's
 * catch block is never reached and no stale error state is shown while the
 * page is navigating away. All other errors are passed through unchanged.
 *
 * @param {import('axios').AxiosResponse} response
 * @param {import('axios').AxiosError}    error
 * @return {Promise<import('axios').AxiosResponse>}
 */
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response?.status;

        if (status === 401) {
            return redirectToLogin();
        }

        if (status === 419) {
            // Attempt to refresh the CSRF cookie using the base axios instance
            // (not `api`) so this call bypasses the interceptor and cannot loop.
            try {
                await axios.get('/sanctum/csrf-cookie');
            } catch {
                return redirectToLogin();
            }

            const originalRequest = error.config;

            // Guard against infinite loops: if the retry itself returns 419,
            // the interceptor fires again, finds this flag set, and redirects.
            if (originalRequest._csrfRetry) {
                return redirectToLogin();
            }

            originalRequest._csrfRetry = true;

            // Replay the original request with the freshly-issued CSRF token.
            try {
                return await api(originalRequest);
            } catch (retryError) {
                const retryStatus = retryError.response?.status;
                if (retryStatus === 401 || retryStatus === 419) {
                    return redirectToLogin();
                }
                return Promise.reject(retryError);
            }
        }

        return Promise.reject(error);
    },
);

export default api;
