// Preference precedence from Notifications §8.2, which adopts User Settings §11.2
// and does not redefine it. A more restrictive user boolean wins, except a
// mandatory topic's in-app record, which is always delivered.
// digest and quiet_hours are not inputs: their schedule is unspecified
// (ENG-IMP-040). The security-alert projection has no classified topic
// (ENG-IMP-036).

const CHANNELS = ["IN_APP", "EMAIL", "PUSH", "SMS"];

const CHANNEL_KEYS = {
  IN_APP: "in_app",
  EMAIL: "email",
  PUSH: "push",
  SMS: "sms",
};

const GLOBAL_KEYS = {
  IN_APP: "in_app_enabled",
  EMAIL: "email_enabled",
  PUSH: "push_enabled",
  SMS: "sms_enabled",
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function booleanOrUnset(value) {
  return typeof value === "boolean" ? value : undefined;
}

function matrixDefault(record, channel) {
  if (channel === "IN_APP") return record.inAppDefault === true;
  if (channel === "EMAIL") return record.emailDefault === true;
  return false;
}

function usableSettings(settings) {
  if (settings == null) return null;
  if (!isPlainObject(settings)) return null;
  return settings;
}

function channelFlags(settings, topic, channel) {
  const usable = usableSettings(settings);
  if (!usable) {
    return { override: undefined, globalToggle: undefined };
  }
  const overrides = isPlainObject(usable.topic_overrides) ? usable.topic_overrides : null;
  const topicOverride = overrides && isPlainObject(overrides[topic]) ? overrides[topic] : null;
  return {
    override: topicOverride ? booleanOrUnset(topicOverride[CHANNEL_KEYS[channel]]) : undefined,
    globalToggle: booleanOrUnset(usable[GLOBAL_KEYS[channel]]),
  };
}

function evaluateChannel({ record, topic, channel, settings, eligible }) {
  if (record.mandatoryClass === "MANDATORY" && channel === "IN_APP") {
    return "deliver";
  }

  const matrix = matrixDefault(record, channel);
  const { override, globalToggle } = channelFlags(settings, topic, channel);
  const userFalse = override === false || globalToggle === false;
  const explicitEnable = override === true && !userFalse;

  let wantsDelivery;
  if (userFalse) {
    wantsDelivery = false;
  } else if (explicitEnable) {
    wantsDelivery = true;
  } else {
    wantsDelivery = matrix;
  }

  if (!wantsDelivery) {
    if (userFalse && (matrix || override === true)) return "suppress";
    return "skip";
  }
  if (!eligible) return "suppress";
  return "deliver";
}

function evaluatePreferences({ record, topic, settings, eligibility }) {
  const flags = eligibility || {};
  const eligibleFor = {
    IN_APP: flags.inAppEligible !== false,
    EMAIL: flags.emailVerified === true,
    PUSH: flags.pushPermitted === true,
    SMS: flags.smsPermitted === true,
  };
  const decisions = {};
  for (const channel of CHANNELS) {
    decisions[channel] = evaluateChannel({
      record,
      topic,
      channel,
      settings,
      eligible: eligibleFor[channel],
    });
  }
  return decisions;
}

module.exports = {
  CHANNELS,
  evaluatePreferences,
};
