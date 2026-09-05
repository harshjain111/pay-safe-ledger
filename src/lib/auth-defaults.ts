// ============================================================================
// The password every new login starts on.
//
// One constant, because it was previously written out in three places
// (ResetPasswordDialog, login-reset, and whatever the enroller happened to
// type) and those can drift apart — an admin telling someone "your password is
// X" while the code set Y is the kind of mismatch nobody notices until the
// person cannot log in.
//
// It is a STARTING password, deliberately guessable, handed over in person and
// changed by the employee from Settings. Never treat it as a secret: anything
// that still has it is effectively unprotected, which is why the enrolment
// screens tell the admin to have the employee change it.
// ============================================================================

/** Starting password for newly created staff and user logins. */
export const DEFAULT_NEW_USER_PASSWORD = '12345678';

/** Minimum length Supabase auth (and our edge functions) will accept. */
export const MIN_PASSWORD_LENGTH = 6;
