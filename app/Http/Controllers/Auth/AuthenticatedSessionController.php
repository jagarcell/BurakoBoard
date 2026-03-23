<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
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
     *   dashboard page after a successful login.
     */
    public function create(Request $request): Response
    {
        if ($request->filled('game') && $request->filled('email')) {
            redirect()->setIntendedUrl(route('dashboard', absolute: false) . '?game=' . rawurlencode((string) $request->query('game')));
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
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

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
