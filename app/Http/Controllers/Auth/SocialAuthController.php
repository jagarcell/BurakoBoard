<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\InvitationService;
use App\Services\SocialAuthService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;

abstract class SocialAuthController extends Controller
{
    /**
     * Construct the controller with service dependencies.
     *
     * @param  \App\Services\SocialAuthService  $socialAuthService  Resolves or creates the user from the OAuth payload.
     * @param  \App\Services\InvitationService  $invitationService  Auto-accepts pending invitations after login.
     * @return void
     * Logic: inject both services so the callback() method can delegate user resolution and
     *   invitation acceptance without containing any business logic itself.
     */
    public function __construct(
        protected readonly SocialAuthService $socialAuthService,
        protected readonly InvitationService $invitationService,
    ) {}

    /**
     * Return the Socialite provider name for the concrete OAuth provider.
     *
     * @return string
     * Logic: each subclass declares its own provider string (e.g. 'apple',
     *   'google') so the shared redirect() and callback() methods can drive
     *   Socialite without any conditional logic.
     */
    abstract protected function provider(): string;

    /**
     * Redirect the user to the OAuth provider's authorisation page.
     *
     * @return \Symfony\Component\HttpFoundation\RedirectResponse
     * Logic: delegates to Socialite using the provider name returned by the
     *   concrete subclass, which builds the authorisation URL and issues the
     *   redirect response.
     */
    public function redirect(): \Symfony\Component\HttpFoundation\RedirectResponse
    {
        return Socialite::driver($this->provider())->redirect();
    }

    /**
     * Handle the callback from the OAuth provider after the user has authorised access.
     *
     * @return RedirectResponse
     * Logic: retrieves the authenticated social user via Socialite. Delegates
     *   user resolution (find-or-create) to SocialAuthService. After login,
     *   if the session holds an invitation_game_id (stored when the user
     *   visited the login page via an invitation link), the pending_invitee
     *   pivot row is silently upgraded to viewer so the game appears in the
     *   dashboard selector.
     *   InvalidStateException is caught when the OAuth state token is missing
     *   or mismatched (e.g. the user navigated directly to the callback URL or
     *   their session expired). Any other exception is caught as a generic
     *   sign-in failure. Both redirect back to the login page with a
     *   descriptive error flash message.
     */
    public function callback(): RedirectResponse
    {
        try {
            $socialUser = Socialite::driver($this->provider())->user();
        } catch (InvalidStateException $e) {
            Log::info('OAuth invalid state (user action)', [
                'provider' => $this->provider(),
                'ip'       => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'The sign-in request was invalid or has expired. Please try again.');
        } catch (\Exception $e) {
            Log::error('OAuth authentication failure', [
                'provider'  => $this->provider(),
                'exception' => get_class($e),
                'message'   => $e->getMessage(),
                'ip'        => request()->ip(),
            ]);
            return redirect()->route('login')
                ->with('error', 'Sign-in with ' . ucfirst($this->provider()) . ' failed. Please try again.');
        }

        $user = $this->socialAuthService->findOrCreateUser($this->provider(), $socialUser);

        Auth::login($user, remember: true);

        request()->session()->regenerate();

        $invitationGameId = request()->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->invitationService->acceptInvitationIfPending((int) $invitationGameId, $user->id);
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }
}
