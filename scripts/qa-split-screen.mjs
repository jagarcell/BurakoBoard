/**
 * QA Split-Screen Video — Game Creation → Invite → Accept → Teams Setup
 *
 * Records a side-by-side MP4 video of the full game-flow QA test using two
 * authenticated browser sessions captured on a virtual X11 display (DISPLAY=:88).
 *
 * Left  panel : CREATOR  (jagarcell@gmail.com)
 * Right panel : VIEWER   (jagarcell@hotmail.com)
 *
 * Steps:
 *  1.  Both users log in (parallel)
 *  2.  Creator creates a game
 *  3.  Creator selects the new game
 *  4.  Creator opens the Invite Viewer modal, selects viewer, sends invitation
 *  5.  Creator closes the invitation dialog
 *  6.  Viewer waits for and accepts the InvitationPopup
 *  7.  Creator creates Team 1 (Team <ts>A) with 2 players
 *  8.  Creator creates Team 2 (Team <ts>B) with 2 players
 *
 * Output : storage/app/qa_videos/qa_split_<timestamp>.mp4
 */

import { chromium } from '@playwright/test';
import { spawn }    from 'child_process';
import { mkdirSync } from 'fs';
import path         from 'path';
import { fileURLToPath } from 'url';

// ─── Configuration ────────────────────────────────────────────────────────────

const APP_URL          = 'https://jagarcellhost.ddns.net';
const CREATOR_EMAIL    = 'jagarcell@gmail.com';
const CREATOR_PASSWORD = 'Mysecret#1';
const VIEWER_EMAIL     = 'jagarcell@hotmail.com';
const VIEWER_PASSWORD  = 'Mysecret#1';
const PAUSE            = 2000;   // ms between CTAs

// Unique timestamp used in names so every run produces different data.
const TS = Date.now();

const GAME_NAME    = `Game ${TS}`;
const TEAM1_NAME   = `Team ${TS}A`;
const TEAM2_NAME   = `Team ${TS}B`;
const PLAYER1_NAME = `Player ${TS}1`;
const PLAYER2_NAME = `Player ${TS}2`;
const PLAYER3_NAME = `Player ${TS}3`;
const PLAYER4_NAME = `Player ${TS}4`;

const DISPLAY      = ':88';
const SCREEN_W     = 1920;
const SCREEN_H     = 1080;
const WIN_W        = 960;   // half-screen width per browser
const WIN_H        = 1080;

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR  = path.resolve(__dirname, '../storage/app/qa_videos');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `qa_split_${TS}.mp4`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Inject a visible custom-cursor overlay into every page load in a browser
 * context. The overlay is a pulsing red circle that moves to the target location
 * when `window.__qaMoveCursor(x, y)` is called, and briefly flashes on click via
 * `window.__qaFlashClick()`.
 */
async function injectCursorOverlay(context) {
    await context.addInitScript(() => {
        const STYLE = `
            #__qa_cursor__ {
                position: fixed;
                z-index: 2147483647;
                pointer-events: none;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: 3px solid #ff2060;
                box-shadow: 0 0 10px rgba(255,32,96,0.7);
                transform: translate(-50%, -50%);
                transition: left 0.25s cubic-bezier(.4,0,.2,1), top 0.25s cubic-bezier(.4,0,.2,1);
                display: none;
                background: rgba(255,32,96,0.12);
            }
            #__qa_cursor__.click {
                background: rgba(255,32,96,0.45) !important;
                transition: background 0s !important;
            }
            @keyframes __qa_pulse {
                0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.7; }
                100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0;   }
            }
            #__qa_ring__ {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                border: 2px solid #ff2060;
                animation: __qa_pulse 1.1s ease-out infinite;
            }
            #__qa_label__ {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 2147483646;
                text-align: center;
                padding: 6px 0 5px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.12em;
                color: #fff;
                pointer-events: none;
            }
        `;

        const init = () => {
            if (document.getElementById('__qa_cursor__')) return;

            const style = document.createElement('style');
            style.textContent = STYLE;
            document.head.appendChild(style);

            const cursor = document.createElement('div');
            cursor.id = '__qa_cursor__';
            const ring = document.createElement('div');
            ring.id = '__qa_ring__';
            cursor.appendChild(ring);
            document.body.appendChild(cursor);

            window.__qaMoveCursor = (x, y) => {
                cursor.style.display = 'block';
                cursor.style.left = `${x}px`;
                cursor.style.top  = `${y}px`;
            };

            window.__qaFlashClick = () => {
                cursor.classList.add('click');
                setTimeout(() => cursor.classList.remove('click'), 220);
            };

            window.__qaHideCursor = () => {
                cursor.style.display = 'none';
            };
        };

        if (document.body) init();
        else                document.addEventListener('DOMContentLoaded', init);
    });
}

/**
 * Inject a fixed panel-label banner ("CREATOR" or "VIEWER") into every page load.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {'CREATOR'|'VIEWER'} role
 */
async function injectPanelLabel(context, role) {
    const bg = role === 'CREATOR' ? '#1d4ed8' : '#059669';
    await context.addInitScript(({ role, bg }) => {
        const init = () => {
            if (document.getElementById('__qa_label__')) return;
            const label = document.createElement('div');
            label.id = '__qa_label__';
            label.textContent = role;
            label.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0;
                z-index: 2147483646;
                text-align: center;
                padding: 5px 0 4px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.12em;
                color: #fff;
                background: ${bg};
                pointer-events: none;
            `;
            document.body.prepend(label);
        };
        if (document.body) init();
        else                document.addEventListener('DOMContentLoaded', init);
    }, { role, bg });
}

/**
 * Move the custom cursor overlay to the bounding-box centre of the given selector,
 * wait for visibility, then click. Throws if the element is not found within
 * the default Playwright timeout.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{ delay?: number }} [opts]
 */
async function clickWithCursor(page, selector, opts = {}) {
    const el  = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 30_000 });
    const box = await el.boundingBox();
    if (box) {
        const cx = box.x + box.width  / 2;
        const cy = box.y + box.height / 2;
        await page.evaluate(([x, y]) => window.__qaMoveCursor?.(x, y), [cx, cy]);
        await sleep(opts.delay ?? 600);
        await page.evaluate(() => window.__qaFlashClick?.());
        await sleep(150);
    }
    await el.click();
}

/**
 * Focus a text/number input, clear it, type new text, then show the cursor.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {string} text
 */
async function fillWithCursor(page, selector, text) {
    const el  = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 15_000 });
    const box = await el.boundingBox();
    if (box) {
        const cx = box.x + box.width  / 2;
        const cy = box.y + box.height / 2;
        await page.evaluate(([x, y]) => window.__qaMoveCursor?.(x, y), [cx, cy]);
        await sleep(400);
    }
    await el.click();
    await el.selectText().catch(() => {});
    // Triple-click to select all then type
    await page.keyboard.press('Control+a');
    await el.type(text, { delay: 60 });
}

// ─── Login helper ─────────────────────────────────────────────────────────────

/**
 * Navigate to /login, fill credentials, submit, and wait for the dashboard.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
async function login(page, email, password) {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });

    await fillWithCursor(page, '#email', email);
    await sleep(PAUSE);

    await fillWithCursor(page, '#password', password);
    await sleep(PAUSE);

    await clickWithCursor(page, 'button:has-text("Log in")');
    // Wait until we land on the dashboard.
    await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
}

// ─── ffmpeg recording ─────────────────────────────────────────────────────────

/**
 * Start an ffmpeg process that records `DISPLAY` to `OUTPUT_FILE`.
 * Returns the ChildProcess so the caller can kill it when done.
 */
function startRecording() {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const args = [
        '-y',
        '-f',       'x11grab',
        '-r',       '30',
        '-s',       `${SCREEN_W}x${SCREEN_H}`,
        '-i',       `${DISPLAY}+0,0`,
        '-draw_mouse', '1',
        '-c:v',     'libx264',
        '-preset',  'fast',
        '-crf',     '23',
        '-pix_fmt', 'yuv420p',
        OUTPUT_FILE,
    ];

    console.log('[ffmpeg] Starting recording →', OUTPUT_FILE);
    const proc = spawn('ffmpeg', args, {
        env:   { ...process.env, DISPLAY },
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stderr.on('data', () => {}); // suppress verbose ffmpeg output
    proc.on('error', (err) => console.error('[ffmpeg] Error:', err.message));

    return proc;
}

/**
 * Gracefully stop the ffmpeg process and wait for it to finish writing the file.
 * @param {import('child_process').ChildProcess} proc
 */
async function stopRecording(proc) {
    return new Promise((resolve) => {
        if (!proc || proc.exitCode !== null) { resolve(); return; }
        console.log('[ffmpeg] Stopping recording…');
        proc.stdin.write('q');          // send 'q' to stop gracefully
        proc.on('close', () => {
            console.log('[ffmpeg] Recording saved →', OUTPUT_FILE);
            resolve();
        });
        setTimeout(() => { proc.kill('SIGTERM'); resolve(); }, 10_000);
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    process.env.DISPLAY = DISPLAY;

    // ── 1. Start screen recording ────────────────────────────────────────────
    const ffmpeg = startRecording();
    await sleep(1500); // give ffmpeg a moment to initialise

    let creatorBrowser, viewerBrowser;

    try {
        // ── 2. Launch browsers ───────────────────────────────────────────────
        const launchOpts = (xOffset) => ({
            headless: false,
            args: [
                `--window-position=${xOffset},0`,
                `--window-size=${WIN_W},${WIN_H}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--ignore-certificate-errors',
            ],
        });

        [creatorBrowser, viewerBrowser] = await Promise.all([
            chromium.launch(launchOpts(0)),
            chromium.launch(launchOpts(WIN_W)),
        ]);

        // Contexts with viewport set to half-screen dimensions.
        const creatorCtx = await creatorBrowser.newContext({
            viewport:         { width: WIN_W, height: WIN_H },
            ignoreHTTPSErrors: true,
        });
        const viewerCtx = await viewerBrowser.newContext({
            viewport:         { width: WIN_W, height: WIN_H },
            ignoreHTTPSErrors: true,
        });

        // Inject cursor overlays + panel labels for both contexts.
        await Promise.all([
            injectCursorOverlay(creatorCtx),
            injectCursorOverlay(viewerCtx),
            injectPanelLabel(creatorCtx, 'CREATOR'),
            injectPanelLabel(viewerCtx, 'VIEWER'),
        ]);

        const creatorPage = await creatorCtx.newPage();
        const viewerPage  = await viewerCtx.newPage();

        // ── 3. Log in — both users in parallel ───────────────────────────────
        console.log('[step] Logging in both users…');
        await Promise.all([
            login(creatorPage, CREATOR_EMAIL, CREATOR_PASSWORD),
            login(viewerPage,  VIEWER_EMAIL,  VIEWER_PASSWORD),
        ]);
        console.log('[step] Both users logged in.');
        await sleep(PAUSE);

        // ── 4. Creator: click "New" to open the Create Game modal ─────────────
        console.log('[step] Creator: opening Create Game modal…');
        await clickWithCursor(creatorPage, 'button:has-text("New")');
        await sleep(PAUSE);

        // ── 5. Creator: fill game name ────────────────────────────────────────
        console.log('[step] Creator: filling game name…');
        await fillWithCursor(creatorPage, '#new-game-name', GAME_NAME);
        await sleep(PAUSE);

        // ── 6. Creator: submit (button text is "Accept" in CreateGameModal) ───
        console.log('[step] Creator: submitting game creation…');
        await clickWithCursor(creatorPage, 'button[type="submit"]:has-text("Accept")');
        // Wait for the modal to close and the game to appear
        await creatorPage.waitForSelector('button[aria-label="Invite a viewer to this game"]', { timeout: 20_000 });
        await sleep(PAUSE);

        // ── 7. Creator: open Invite Viewer modal ──────────────────────────────
        console.log('[step] Creator: opening Invite Viewer modal…');
        await clickWithCursor(creatorPage, 'button[aria-label="Invite a viewer to this game"]');
        // Wait for the modal to load users
        await creatorPage.waitForSelector('ul[role="list"] li label', { timeout: 20_000 });
        await sleep(PAUSE);

        // ── 8. Creator: select the viewer's checkbox ──────────────────────────
        console.log('[step] Creator: selecting viewer checkbox…');
        // Click the first user checkbox in the invite modal
        await clickWithCursor(creatorPage, 'ul[role="list"] li label');
        await sleep(PAUSE);

        // ── 9. Creator: send the invitation ───────────────────────────────────
        console.log('[step] Creator: sending invitation…');
        await clickWithCursor(creatorPage, 'button:has-text("Send")');
        // Wait for success message
        await creatorPage.waitForSelector('p.text-emerald-600', { timeout: 15_000 });
        await sleep(PAUSE);

        // ── 10. Creator: close the invite dialog ──────────────────────────────
        console.log('[step] Creator: closing invite dialog…');
        await clickWithCursor(creatorPage, 'button:has-text("Close")');
        await sleep(PAUSE);

        // ── 11. Viewer: wait for and accept the InvitationPopup ───────────────
        console.log('[step] Viewer: waiting for invitation popup…');
        // The popup may appear via real-time push; poll up to 30s.
        await viewerPage.waitForSelector(
            'button[aria-label^="Accept invitation to"]',
            { timeout: 40_000 },
        );
        await sleep(PAUSE);

        console.log('[step] Viewer: accepting invitation…');
        await clickWithCursor(viewerPage, 'button[aria-label^="Accept invitation to"]');
        // Wait for the popup to disappear (invitation accepted)
        await viewerPage.waitForSelector(
            'button[aria-label^="Accept invitation to"]',
            { state: 'hidden', timeout: 15_000 },
        ).catch(() => {}); // popup may already be gone
        await sleep(PAUSE);

        // ── 12. Creator: create Team 1 with 2 players ─────────────────────────
        console.log('[step] Creator: creating Team 1…');
        // If needed ensure we're still on the dashboard with the game selected.
        await creatorPage.waitForSelector('button:has-text("Create team")', { timeout: 20_000 });

        // Click the first "Create team" button (slot 0)
        await clickWithCursor(creatorPage, 'button:has-text("Create team") >> nth=0');
        await sleep(PAUSE);

        // Fill team name
        console.log('[step] Creator: filling Team 1 name…');
        await fillWithCursor(creatorPage, '#team-name', TEAM1_NAME);
        await sleep(PAUSE);

        // Add Player 1
        console.log('[step] Creator: adding Player 1…');
        await fillWithCursor(creatorPage, '#player-name', PLAYER1_NAME);
        await sleep(PAUSE);
        await clickWithCursor(creatorPage, 'button:has-text("Add player")');
        await sleep(PAUSE);

        // Add Player 2
        console.log('[step] Creator: adding Player 2…');
        await fillWithCursor(creatorPage, '#player-name', PLAYER2_NAME);
        await sleep(PAUSE);
        await clickWithCursor(creatorPage, 'button:has-text("Add player")');
        await sleep(PAUSE);

        // Submit Team 1
        console.log('[step] Creator: submitting Team 1…');
        await clickWithCursor(creatorPage, 'button[type="submit"]:has-text("Create team")');
        // Wait for modal to close
        await creatorPage.waitForSelector('#team-name', { state: 'hidden', timeout: 15_000 })
            .catch(() => {});
        await sleep(PAUSE);

        // ── 13. Creator: create Team 2 with 2 players ─────────────────────────
        console.log('[step] Creator: creating Team 2…');
        // Now there should be a second "Create team" button for slot 1.
        await creatorPage.waitForSelector('button:has-text("Create team")', { timeout: 20_000 });
        await clickWithCursor(creatorPage, 'button:has-text("Create team") >> nth=0');
        await sleep(PAUSE);

        // Fill team name
        console.log('[step] Creator: filling Team 2 name…');
        await fillWithCursor(creatorPage, '#team-name', TEAM2_NAME);
        await sleep(PAUSE);

        // Add Player 3
        console.log('[step] Creator: adding Player 3…');
        await fillWithCursor(creatorPage, '#player-name', PLAYER3_NAME);
        await sleep(PAUSE);
        await clickWithCursor(creatorPage, 'button:has-text("Add player")');
        await sleep(PAUSE);

        // Add Player 4
        console.log('[step] Creator: adding Player 4…');
        await fillWithCursor(creatorPage, '#player-name', PLAYER4_NAME);
        await sleep(PAUSE);
        await clickWithCursor(creatorPage, 'button:has-text("Add player")');
        await sleep(PAUSE);

        // Submit Team 2
        console.log('[step] Creator: submitting Team 2…');
        await clickWithCursor(creatorPage, 'button[type="submit"]:has-text("Create team")');
        await creatorPage.waitForSelector('#team-name', { state: 'hidden', timeout: 15_000 })
            .catch(() => {});
        await sleep(PAUSE);

        // ── 14. Final pause to show the result ────────────────────────────────
        console.log('[step] Holding on final state…');
        await sleep(PAUSE);
        console.log('[done] QA flow complete.');

    } catch (err) {
        console.error('[error]', err);
    } finally {
        if (creatorBrowser) await creatorBrowser.close().catch(() => {});
        if (viewerBrowser)  await viewerBrowser.close().catch(() => {});
        await stopRecording(ffmpeg);
    }
})();
