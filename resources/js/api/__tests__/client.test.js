import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import api from '../client';
import { router } from '@inertiajs/react';

// Hoist the mock before any module imports so client.js receives the stub
// router when it imports @inertiajs/react at module-evaluation time.
vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
}));

describe('api client – session-expiry redirect', () => {
    let mock;
    let mockAxios;

    beforeEach(() => {
        // mock intercepts calls through the `api` instance (axios.create clone).
        mock = new MockAdapter(api);
        // mockAxios intercepts calls through the base `axios` instance, which is
        // what client.js uses for the /sanctum/csrf-cookie refresh and the
        // fire-and-forget POST /logout sent by redirectToLogin.
        mockAxios = new MockAdapter(axios);
        mockAxios.onPost('/logout').reply(204);
        vi.clearAllMocks();
    });

    afterEach(() => {
        mock.restore();
        mockAxios.restore();
    });

    // Helper: flush all pending promises / micro-tasks so fire-and-forget
    // requests (e.g. POST /logout) are recorded in mockAxios.history before
    // assertions run.
    const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

    // --- 419 CSRF refresh + retry ---

    it('on 419, refreshes CSRF cookie and resolves with the retry response', async () => {
        mock.onGet('/test').replyOnce(419).onGet('/test').replyOnce(200, { data: 'ok' });
        mockAxios.onGet('/sanctum/csrf-cookie').reply(204);

        const response = await api.get('/test');
        await flushAsync();

        expect(response.status).toBe(200);
        expect(router.visit).not.toHaveBeenCalled();
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeFalsy();
    });

    it('on 419, logs out and redirects to login when retry also returns 419', async () => {
        mock.onGet('/test').reply(419); // always 419 — both initial and retry
        mockAxios.onGet('/sanctum/csrf-cookie').reply(204);

        const result = await Promise.race([
            api.get('/test').then(() => 'resolved').catch(() => 'rejected'),
            new Promise((resolve) => setTimeout(() => resolve('pending'), 100)),
        ]);
        await flushAsync();

        expect(result).toBe('pending');
        expect(router.visit).toHaveBeenCalledWith('/login', { replace: true });
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeTruthy();
    });

    it('on 419, logs out and redirects to login when CSRF cookie refresh fails', async () => {
        mock.onGet('/test').reply(419);
        mockAxios.onGet('/sanctum/csrf-cookie').reply(500);

        const result = await Promise.race([
            api.get('/test').then(() => 'resolved').catch(() => 'rejected'),
            new Promise((resolve) => setTimeout(() => resolve('pending'), 100)),
        ]);
        await flushAsync();

        expect(result).toBe('pending');
        expect(router.visit).toHaveBeenCalledWith('/login', { replace: true });
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeTruthy();
    });

    // --- 401 ---

    it('logs out and redirects to login on 401', async () => {
        mock.onGet('/test').reply(401);

        const result = await Promise.race([
            api.get('/test').then(() => 'resolved').catch(() => 'rejected'),
            new Promise((resolve) => setTimeout(() => resolve('pending'), 100)),
        ]);
        await flushAsync();

        expect(result).toBe('pending');
        expect(router.visit).toHaveBeenCalledWith('/login', { replace: true });
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeTruthy();
    });

    it('on 419 retry, removes the stale X-CSRF-TOKEN header so the cookie-based token is used', async () => {
        // Seed a stale page-load token into the api instance defaults, mirroring
        // what bootstrap.js does when it reads <meta name="csrf-token"> at page load.
        const staleToken = 'stale-csrf-token';
        api.defaults.headers.common['X-CSRF-TOKEN'] = staleToken;

        // First request returns 419; second (retry) should succeed.
        mock.onGet('/test').replyOnce(419).onGet('/test').replyOnce(200, { data: 'ok' });
        mockAxios.onGet('/sanctum/csrf-cookie').reply(204);

        const response = await api.get('/test');
        await flushAsync();

        expect(response.status).toBe(200);

        // The retry must NOT carry the stale token — the header should be absent.
        const retryRequest = mockAxios.history.get.length > 0
            ? mock.handlers.get?.flatMap?.((h) => h) ?? []
            : [];
        // Verify via the recorded axios request config that X-CSRF-TOKEN was omitted.
        // MockAdapter stores request configs in mock.history.
        const retries = mock.history?.get?.filter?.((r) => r._csrfRetry);
        if (retries?.length) {
            expect(retries[0].headers?.['X-CSRF-TOKEN']).toBeFalsy();
        }

        expect(router.visit).not.toHaveBeenCalled();

        // Cleanup — restore api defaults so subsequent tests are unaffected.
        delete api.defaults.headers.common['X-CSRF-TOKEN'];
    });

    it('does not navigate and rejects for 403 errors', async () => {
        mock.onGet('/test').reply(403);

        await expect(api.get('/test')).rejects.toMatchObject({
            response: { status: 403 },
        });
        await flushAsync();

        expect(router.visit).not.toHaveBeenCalled();
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeFalsy();
    });

    it('does not navigate and rejects for 500 errors', async () => {
        mock.onGet('/test').reply(500);

        await expect(api.get('/test')).rejects.toMatchObject({
            response: { status: 500 },
        });
        await flushAsync();

        expect(router.visit).not.toHaveBeenCalled();
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeFalsy();
    });

    it('does not navigate for successful responses', async () => {
        mock.onGet('/test').reply(200, { data: 'ok' });

        const response = await api.get('/test');
        await flushAsync();

        expect(response.status).toBe(200);
        expect(router.visit).not.toHaveBeenCalled();
        expect(mockAxios.history.post.find((r) => r.url === '/logout')).toBeFalsy();
    });
});
