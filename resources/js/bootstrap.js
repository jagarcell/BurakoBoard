import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
// Do NOT set a static X-CSRF-TOKEN header here. Capturing the token once at page-load time
// results in a stale value after session()->regenerate() runs during login/logout:
// the XSRF-TOKEN cookie is refreshed by VerifyCsrfToken on every response, so axios's
// built-in XSRF-TOKEN cookie → X-XSRF-TOKEN header mechanism is always up to date.

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    // Use window.axios so the XSRF-TOKEN cookie is automatically read and the
    // X-XSRF-TOKEN header is injected into the /broadcasting/auth POST.
    // The built-in pusher-js XHR auth mechanism does not add this header,
    // causing the web-guarded auth endpoint to reject with 419.
    authorizer: (channel) => ({
        authorize: (socketId, callback) => {
            window.axios
                .post('/broadcasting/auth', {
                    socket_id: socketId,
                    channel_name: channel.name,
                })
                .then((response) => callback(false, response.data))
                .catch((error) => callback(true, error));
        },
    }),
});
