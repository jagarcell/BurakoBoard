<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class AppleAuthController extends Controller
{
    /**
     * Redirect the user to the Apple Sign In authorisation page.
     *
     * @return \Symfony\Component\HttpFoundation\RedirectResponse
     *
     * Logic: Delegates to Socialite which builds the Sign in with Apple
     *        authorisation URL and redirects the browser to it.
     */
    public function redirect(): \Symfony\Component\HttpFoundation\RedirectResponse
    {
        return Socialite::driver('apple')->redirect();
    }

    /**
     * Handle the callback from Apple after the user has authorised access.
     *
     * Apple sends the callback as an HTTP POST (response_mode: form_post)
     * rather than a GET redirect, so this method must be bound to a POST route
     * and the route must be excluded from CSRF verification.
     *
     * @return RedirectResponse
     *
     * Logic: Retrieves the Apple user from Socialite. Looks up the user by
     *        `apple_id` first; if not found, falls back to a match by e-mail
     *        so that existing accounts created through other providers are
     *        linked automatically. When neither exists, a new account is
     *        created with a random password (the user may set one later via
     *        the forgot-password flow). Apple only supplies the display name
     *        on the very first sign-in, so a fallback is derived from the
     *        e-mail local-part for subsequent logins. The session is always
     *        regenerated before redirecting to the dashboard.
     */
    public function callback(): RedirectResponse
    {
        $appleUser = Socialite::driver('apple')->user();

        $user = User::where('apple_id', $appleUser->getId())->first();

        if (! $user) {
            $user = User::where('email', $appleUser->getEmail())->first();

            if ($user) {
                $user->update(['apple_id' => $appleUser->getId()]);
            } else {
                $name = $appleUser->getName()
                    ?? Str::before($appleUser->getEmail(), '@');

                $user = User::create([
                    'name'              => $name,
                    'email'             => $appleUser->getEmail(),
                    'apple_id'          => $appleUser->getId(),
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
