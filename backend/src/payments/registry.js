const mock = require("./mock-adapter");
const cashfree = require("./cashfree-adapter");

const ADAPTERS = {
  mock,
  cashfree,
};

function selectedName() {
  return process.env.PAYMENT_PROVIDER;
}

function adapter() {
  const name = selectedName();
  const selected = ADAPTERS[name];
  if (!selected) {
    const error = new Error("payment provider is not configured");
    error.code = "payment_provider_unconfigured";
    throw error;
  }
  return selected;
}

module.exports = {
  adapter,
  selectedName,
};
