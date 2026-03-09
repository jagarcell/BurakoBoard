import '@testing-library/jest-dom/vitest';

if (! Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
}
