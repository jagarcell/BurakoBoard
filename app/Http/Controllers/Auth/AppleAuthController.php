<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;

class AppleAuthController extends Controller
{
    /**
     * Construct the controller with the invitation service dependency.
     *
     * @param  \App\Services\InvitationService  $service  Service used to auto-accept pending invitations after login.
     * @return void
     * Logic: inject the invitation service so the callback() method can silently upgrade any
     *   pending_invitee pivot row when the user signs in via Apple from an invitation link.
     */
    public function __construct(private readonly InvitationService $service) {}

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
     *        e-mail local-part for subsequent logins. After login, if the
     *        session holds an invitation_game_id (stored when the user visited
     *        the login page via an invitation link), the pending_invitee pivot
     *        row is silently upgraded to viewer so the game appears in the
     *        dashboard selector.
     *        InvalidStateException is caught when the OAuth state token is
     *        missing or mismatched (e.g. the user navigated directly to the
     *        callback URL or their session expired). Any other exception is
     *        caught as a generic sign-in failure. Both redirect back to the
     *        login page with a descriptive error flash message.
     */
    public function callback(): RedirectResponse
    {
        try {
            $appleUser = Socialite::driver('apple')->user();
        } catch (InvalidStateException $e) {
            Log::info('OAuth invalid state (user action)', [
                'provider' => 'apple',
                'ip'       => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'The sign-in request was invalid or has expired. Please try again.');
        } catch (\Exception $e) {
            Log::error('OAuth authentication failure', [
                'provider'  => 'apple',
                'exception' => get_class($e),
                'message'   => $e->getMessage(),
                'ip'        => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'Sign-in with Apple failed. Please try again.');
        }

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

        $invitationGameId = request()->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->service->acceptInvitationIfPending((int) $invitationGameId, $user->id);
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }
}
