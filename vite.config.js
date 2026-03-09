import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        hmr: false,
    },
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: false,
        }),
        react({
            fastRefresh: false,
        }),
    ],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['resources/js/test/setup.js'],
    },
});
