<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\BurakoGameService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;

class GoogleAuthController extends Controller
{
    /**
     * Construct the controller with the game service dependency.
     *
     * @param  \App\Services\BurakoGameService  $service  Service used to auto-accept pending invitations after login.
     * @return void
     * Logic: inject the game service so the callback() method can silently upgrade any
     *   pending_invitee pivot row when the user signs in via Google from an invitation link.
     */
    public function __construct(private readonly BurakoGameService $service) {}

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
     *        via the forgot-password flow). After login, if the session holds
     *        an invitation_game_id (stored when the user visited the login page
     *        via an invitation link), the pending_invitee pivot row is silently
     *        upgraded to viewer so the game appears in the dashboard selector.
     *        InvalidStateException is caught when the OAuth state token is
     *        missing or mismatched (e.g. the user navigated directly to the
     *        callback URL or their session expired). Any other exception is
     *        caught as a generic sign-in failure. Both redirect back to the
     *        login page with a descriptive error flash message.
     */
    public function callback(): RedirectResponse
    {
        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (InvalidStateException $e) {
            Log::info('OAuth invalid state (user action)', [
                'provider' => 'google',
                'ip'       => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'The sign-in request was invalid or has expired. Please try again.');
        } catch (\Exception $e) {
            Log::error('OAuth authentication failure', [
                'provider'  => 'google',
                'exception' => get_class($e),
                'message'   => $e->getMessage(),
                'ip'        => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'Sign-in with Google failed. Please try again.');
        }

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

        $invitationGameId = request()->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->service->acceptInvitationIfPending((int) $invitationGameId, $user->id);
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }
}
