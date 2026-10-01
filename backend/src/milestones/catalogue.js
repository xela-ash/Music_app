// Controlled deliverable catalogue from milestones.md Section 9.3.
// vocal_stems is one obligation shown in two groups.

const DELIVERABLE_CATALOGUE = [
  { code: "final_master_wav", label: "Final Master WAV", groups: ["Masters"] },
  { code: "final_master_mp3", label: "Final Master MP3", groups: ["Masters"] },
  { code: "instrumental_master", label: "Instrumental Master", groups: ["Masters"] },
  { code: "acapella_vocal_master", label: "Acapella/Vocal Master", groups: ["Masters"] },
  { code: "clean_radio_edit", label: "Clean/Radio Edit", groups: ["Masters"] },
  { code: "final_mix_wav", label: "Final Mix WAV", groups: ["Mixing"] },
  { code: "final_mix_mp3", label: "Final Mix MP3", groups: ["Mixing"] },
  { code: "instrumental_mix", label: "Instrumental Mix", groups: ["Mixing"] },
  { code: "acapella_mix", label: "Acapella Mix", groups: ["Mixing"] },
  { code: "tv_mix", label: "TV Mix", groups: ["Mixing"] },
  { code: "mixed_stems", label: "Mixed Stems", groups: ["Stems"] },
  { code: "unmixed_raw_stems", label: "Unmixed/Raw Stems", groups: ["Stems"] },
  { code: "vocal_stems", label: "Vocal Stems", groups: ["Stems", "Vocals"] },
  { code: "instrumental_stems", label: "Instrumental Stems", groups: ["Stems"] },
  { code: "full_production", label: "Full Production", groups: ["Production"] },
  { code: "instrumental_beat", label: "Instrumental/Beat", groups: ["Production"] },
  { code: "arrangement", label: "Arrangement", groups: ["Production"] },
  { code: "midi_files", label: "MIDI Files", groups: ["Production"] },
  { code: "lead_vocals", label: "Lead Vocals", groups: ["Vocals"] },
  { code: "backing_vocals", label: "Backing Vocals", groups: ["Vocals"] },
  { code: "raw_vocal_takes", label: "Raw Vocal Takes", groups: ["Vocals"] },
  { code: "daw_project_session_files", label: "DAW Project/Session Files", groups: ["Session / Source"] },
  { code: "consolidated_audio_files", label: "Consolidated Audio Files", groups: ["Session / Source"] },
  { code: "individual_source_tracks", label: "Individual Source Tracks", groups: ["Session / Source"] },
  { code: "lyrics", label: "Lyrics", groups: ["Songwriting"] },
  { code: "melody", label: "Melody", groups: ["Songwriting"] },
  { code: "chords_chord_chart", label: "Chords/Chord Chart", groups: ["Songwriting"] },
  { code: "demo_recording", label: "Demo Recording", groups: ["Songwriting"] },
  { code: "reference_preview_file", label: "Reference/Preview File", groups: ["Other"] },
  { code: "other_agreed_deliverable", label: "Other Agreed Deliverable", groups: ["Other"] },
];

const CODES = new Set(DELIVERABLE_CATALOGUE.map((entry) => entry.code));

function validateDeliverableDefinition(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Each milestone must select its deliverables from the catalogue" };
  }
  const allowed = new Set(["required_deliverables", "other_description"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return { ok: false, error: "Milestone deliverable definition contains an unsupported field" };
    }
  }
  const selected = value.required_deliverables;
  if (!Array.isArray(selected) || selected.length === 0) {
    return { ok: false, error: "Each milestone must select at least one deliverable" };
  }
  const ordered = [];
  const seen = new Set();
  for (const code of selected) {
    if (typeof code !== "string" || !CODES.has(code)) {
      return { ok: false, error: "Milestone deliverable selection is not in the catalogue" };
    }
    if (!seen.has(code)) {
      seen.add(code);
      ordered.push(code);
    }
  }
  let otherDescription = null;
  if (seen.has("other_agreed_deliverable")) {
    if (typeof value.other_description !== "string" || !value.other_description.trim()) {
      return { ok: false, error: "Other Agreed Deliverable requires a description" };
    }
    otherDescription = value.other_description.trim();
  } else if (value.other_description !== undefined && value.other_description !== null && value.other_description !== "") {
    return { ok: false, error: "A custom deliverable description requires Other Agreed Deliverable" };
  }
  return {
    ok: true,
    value: {
      required_deliverables: ordered,
      other_description: otherDescription,
    },
  };
}

function assertSnapshotReady(milestones, project) {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return { ok: false };
  }
  for (const milestone of milestones) {
    if (milestone.currency !== project.currency) {
      return { ok: false };
    }
    if (Number(milestone.currency_exponent) !== Number(project.currency_exponent)) {
      return { ok: false };
    }
    if (
      typeof milestone.revision_allowance !== "number"
      || !Number.isInteger(milestone.revision_allowance)
      || milestone.revision_allowance < 0
    ) {
      return { ok: false };
    }
    if (!validateDeliverableDefinition(milestone.deliverable_definition).ok) {
      return { ok: false };
    }
    if (!Number.isSafeInteger(Number(milestone.amount)) || Number(milestone.amount) <= 0) {
      return { ok: false };
    }
  }
  return { ok: true };
}

module.exports = {
  DELIVERABLE_CATALOGUE,
  assertSnapshotReady,
  validateDeliverableDefinition,
};
