// Catalogue from milestones.md Section 9.3. vocal_stems is one code.

export interface DeliverableEntry {
  code: string;
  label: string;
  groups: string[];
}

export const DELIVERABLE_CATALOGUE: DeliverableEntry[] = [
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

export const DELIVERABLE_GROUPS = ["Masters", "Mixing", "Stems", "Production", "Vocals", "Session / Source", "Songwriting", "Other"];

export function deliverableLabel(code: string): string {
  return DELIVERABLE_CATALOGUE.find((entry) => entry.code === code)?.label ?? code;
}
