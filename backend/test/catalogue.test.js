const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DELIVERABLE_CATALOGUE, validateDeliverableDefinition } = require("../src/milestones/catalogue");

describe("deliverable catalogue", () => {
  it("keeps vocal stems as one code shown in two groups", () => {
    const matches = DELIVERABLE_CATALOGUE.filter((entry) => entry.code === "vocal_stems");
    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].groups, ["Stems", "Vocals"]);
  });

  it("requires a description only for Other Agreed Deliverable", () => {
    const missing = validateDeliverableDefinition({
      required_deliverables: ["other_agreed_deliverable"],
      other_description: "  ",
    });
    assert.equal(missing.ok, false);

    const present = validateDeliverableDefinition({
      required_deliverables: ["other_agreed_deliverable", "lyrics"],
      other_description: " Session notes ",
    });
    assert.equal(present.ok, true);
    assert.deepEqual(present.value.required_deliverables, ["other_agreed_deliverable", "lyrics"]);
    assert.equal(present.value.other_description, "Session notes");

    const stray = validateDeliverableDefinition({
      required_deliverables: ["lyrics"],
      other_description: "extra",
    });
    assert.equal(stray.ok, false);
  });

  it("rejects an empty selection and a code outside the catalogue", () => {
    assert.equal(validateDeliverableDefinition({ required_deliverables: [] }).ok, false);
    assert.equal(validateDeliverableDefinition({ required_deliverables: ["24_bit_wav"] }).ok, false);
    assert.equal(validateDeliverableDefinition({ notes: "free text" }).ok, false);
  });
});
