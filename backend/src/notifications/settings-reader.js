// INT-NOTIFICATIONS-002. Notifications reads a preference; it does not store one.
// User Settings has no table, so the production reader reports the read
// unavailable. Section 15.1 then uses the topic-matrix default. Tests replace
// the reader for one call. Nothing exposes this function over HTTP.

async function unavailableReader() {
  return { ok: false, reason: "user_settings_unavailable" };
}

let reader = unavailableReader;

function setNotificationSettingsReader(next) {
  if (typeof next !== "function") {
    throw new Error("notification settings reader must be a function");
  }
  reader = next;
}

function resetNotificationSettingsReader() {
  reader = unavailableReader;
}

async function readNotificationSettings(recipientUserId) {
  return reader(recipientUserId);
}

module.exports = {
  readNotificationSettings,
  setNotificationSettingsReader,
  resetNotificationSettingsReader,
};
