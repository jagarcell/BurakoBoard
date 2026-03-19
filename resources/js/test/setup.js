import '@testing-library/jest-dom/vitest';

if (! Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
}

if (! Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}
