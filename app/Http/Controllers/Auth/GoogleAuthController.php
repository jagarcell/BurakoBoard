<?php

namespace App\Http\Controllers\Auth;

class GoogleAuthController extends SocialAuthController
{
    /**
     * Return the Socialite provider name for Google OAuth.
     *
     * @return string
     * Logic: identifies this controller as the Google OAuth handler so the
     *   shared redirect() and callback() methods in SocialAuthController drive
     *   Socialite with the correct provider.
     */
    protected function provider(): string
    {
        return 'google';
    }
}
