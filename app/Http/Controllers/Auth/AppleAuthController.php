<?php

namespace App\Http\Controllers\Auth;

class AppleAuthController extends SocialAuthController
{
    /**
     * Return the Socialite provider name for Apple Sign In.
     *
     * @return string
     * Logic: identifies this controller as the Apple OAuth handler so the
     *   shared redirect() and callback() methods in SocialAuthController drive
     *   Socialite with the correct provider.
     */
    protected function provider(): string
    {
        return 'apple';
    }
}
