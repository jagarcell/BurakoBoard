<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\InvitationService;
use Illuminate\Auth\Events\Verified;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\RedirectResponse;

class VerifyEmailController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * Mark the authenticated user's email address as verified.
     */
    public function __invoke(EmailVerificationRequest $request): RedirectResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return redirect()->intended(route('dashboard', absolute: false).'?verified=1');
        }

        if ($request->user()->markEmailAsVerified()) {
            event(new Verified($request->user()));
        }

        // If the registering flow stored an invitation in session, accept it
        // now that the user's email has been verified.
        $invitationGameId = $request->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->invitations->acceptInvitationIfPending((int) $invitationGameId, (int) $request->user()->id);
        }

        return redirect()->intended(route('dashboard', absolute: false).'?verified=1');
    }
}
