const MOCK_ENGINE = "mock-scanner";
const MOCK_SIGNATURE = "mvp-010";

// Provider-neutral scan result. No production scanner is selected.
async function mockScan() {
  return {
    status: "clean",
    engine: MOCK_ENGINE,
    signatureVersion: MOCK_SIGNATURE,
  };
}

let scanner = mockScan;

function setScannerForTests(next) {
  scanner = next || mockScan;
}

async function scanObject() {
  return scanner();
}

module.exports = {
  MOCK_ENGINE,
  MOCK_SIGNATURE,
  scanObject,
  setScannerForTests,
};
