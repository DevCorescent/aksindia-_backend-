/**
 * Minimum password length, enforced on signup, reset, change and admin reset.
 * Kept in one place so the API and the registration UI agree — they previously
 * disagreed (API 6, UI 8), letting API-created accounts hold weaker passwords
 * than the forms would ever allow.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Shared message so controllers can match on it when mapping errors to 400s. */
export const PASSWORD_TOO_SHORT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
