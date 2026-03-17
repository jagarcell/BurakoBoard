<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /**
     * Redirect the user to the Google OAuth authorisation page.
     *
     * @return \Symfony\Component\HttpFoundation\RedirectResponse
     *
     * Logic: Delegates to Socialite which builds the authorisation URL
     *        with the configured scopes and redirects the browser to it.
     */
    public function redirect(): \Symfony\Component\HttpFoundation\RedirectResponse
    {
        return Socialite::driver('google')->redirect();
    }

    /**
     * Handle the callback from Google after the user has authorised access.
     *
     * @return RedirectResponse
     *
     * Logic: Exchanges the code returned by Google for a user object via
     *        Socialite. If a user with the returned google_id already exists
     *        we log them in directly. Otherwise we look up by e-mail; if a
     *        matching account is found we attach the google_id so future
     *        logins skip the e-mail look-up. When neither exists we create a
     *        new account with a random password (the user may set one later
     *        via the forgot-password flow). In all cases the session is
     *        regenerated before redirecting to the dashboard.
     */
    public function callback(): RedirectResponse
    {
        $googleUser = Socialite::driver('google')->user();

        $user = User::where('google_id', $googleUser->getId())->first();

        if (! $user) {
            $user = User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                $user->update(['google_id' => $googleUser->getId()]);
            } else {
                $user = User::create([
                    'name'              => $googleUser->getName(),
                    'email'             => $googleUser->getEmail(),
                    'google_id'         => $googleUser->getId(),
                    'password'          => bcrypt(Str::random(32)),
                    'email_verified_at' => now(),
                ]);
            }
        }

        Auth::login($user, remember: true);

        request()->session()->regenerate();

        return redirect()->intended(route('dashboard', absolute: false));
    }
}
