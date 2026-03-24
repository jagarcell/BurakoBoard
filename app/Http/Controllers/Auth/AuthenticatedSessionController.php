<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\BurakoGameService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Construct the controller with the game service dependency.
     *
     * @param  \App\Services\BurakoGameService  $service  Service used to auto-accept pending invitations after login.
     * @return void
     * Logic: inject the game service so the store() method can silently upgrade any
     *   pending_invitee pivot row when the user logs in via an invitation link.
     */
    public function __construct(private readonly BurakoGameService $service) {}

    /**
     * Display the login view.
     *
     * @param  \Illuminate\Http\Request  $request  Current request; may carry
     *         an `email` query parameter (pre-filled from an invitation link)
     *         and a `game` query parameter to redirect to after login.
     * @return \Inertia\Response The login page with optional pre-filled email.
     * Logic: when the request contains an `email` param (e.g. from an
     *   invitation email link) pass it to the Inertia page so the frontend
     *   can seed the email input. When a `game` param is also present, store
     *   the intended redirect URL so Laravel redirects to that game's
     *   dashboard page after a successful login, and store the game ID in the
     *   session so post-login handlers can auto-accept the invitation.
     */
    public function create(Request $request): Response
    {
        if ($request->filled('game') && $request->filled('email')) {
            redirect()->setIntendedUrl(route('dashboard', absolute: false) . '?game=' . rawurlencode((string) $request->query('game')));
            session(['invitation_game_id' => (int) $request->query('game')]);
        }

        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
            'error'  => session('error'),
            'email'  => $request->query('email', ''),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     *
     * @param  \App\Http\Requests\Auth\LoginRequest  $request  Validated login credentials.
     * @return \Illuminate\Http\RedirectResponse Redirect to the intended URL (or dashboard).
     * Logic: authenticate the user, regenerate the session to prevent fixation, then check
     *   whether an invitation_game_id was stored in the session from an invitation link visit.
     *   If present, silently upgrade the pending_invitee pivot row to viewer so the game
     *   appears in the user's dropdown. Finally redirect to the stored intended URL (which
     *   carries the ?game= param) so the dashboard auto-selects the accepted game.
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

        $invitationGameId = $request->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->service->acceptInvitationIfPending((int) $invitationGameId, (int) auth()->id());
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}
