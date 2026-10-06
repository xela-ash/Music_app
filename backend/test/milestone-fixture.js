// Explicit milestone commercial terms for tests. Production does not default
// revision_allowance or the deliverable selection.
function withMilestoneTerms(milestone) {
  return {
    revision_allowance: 0,
    deliverable_definition: {
      required_deliverables: ["final_master_wav"],
      other_description: null,
    },
    ...milestone,
  };
}

module.exports = {
  withMilestoneTerms,
};
