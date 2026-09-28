// Authentication §8.1 and §12.3. Labels match the snake_case user_status
// convention in backend/db/001_create_users.sql. restricted and
// email_verification_pending are not in that enum yet; they are allowed
// here so a later additive enum value is not rejected by this middleware.
const AUTHENTICATABLE_ACCOUNT_STATUSES = new Set([
  "active",
  "restricted",
  "email_verification_pending",
]);

function accountMayAuthenticate(status) {
  return AUTHENTICATABLE_ACCOUNT_STATUSES.has(status);
}

module.exports = {
  AUTHENTICATABLE_ACCOUNT_STATUSES,
  accountMayAuthenticate,
};
