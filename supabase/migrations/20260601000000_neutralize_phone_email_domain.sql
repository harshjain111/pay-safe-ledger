-- Move phone-login pseudo-emails off the client-specific brand domain to a neutral one.
-- Mirrors the earlier '@phone.smokzy.internal' -> '@phone.konnect2hospitality.internal'
-- rewrite so existing users keep the email identifier they sign in with.
--
-- IMPORTANT: the replacement domain below must match the domain produced by the app:
--   - frontend  : VITE_PHONE_EMAIL_DOMAIN  (src/lib/auth-email.ts)
--   - edge funcs : PHONE_EMAIL_DOMAIN
-- Both default to 'phone.payroll.internal'. If you override those env vars to a
-- different domain, change the replacement string here to match before applying,
-- otherwise existing users will be unable to sign in.
UPDATE auth.users
SET email = regexp_replace(email, '@phone\.konnect2hospitality\.internal$', '@phone.payroll.internal')
WHERE email LIKE '%@phone.konnect2hospitality.internal';
