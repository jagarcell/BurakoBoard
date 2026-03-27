import '../css/app.css';
import './bootstrap';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

// When the session expires or the CSRF token goes stale the server returns 401
// or 419 for an Inertia navigation request. Cancel the default error modal and
// navigate to /login via Inertia's router.
//
// router.visit() rather than window.location.* is intentional: a raw location
// change lets React's MessageChannel scheduler fire deferred startTransition
// work against the partially-torn-down fiber tree, corrupting the update queue.
// router.visit() calls ReactDOM.flushSync() when swapping the component tree,
// which drains all pending React work synchronously before replacing the tree.
// replace: true avoids leaving a back-navigation entry to the expired state.
document.addEventListener('inertia:invalid', (e) => {
    const status = e.detail.response.status;
    if (status === 401 || status === 419) {
        e.preventDefault();
        router.visit('/login', { replace: true });
    }
});

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.jsx`,
            import.meta.glob('./Pages/**/*.jsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: '#4B5563',
    },
});
