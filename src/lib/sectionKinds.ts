/**
 * Section kinds.
 *
 * A section's `kind` is a stable slug that drives behavior; `name` is a free-text
 * label the user can rename at will. Anything conditional on what a section *is*
 * (the Lighting fixture-schedule integration, the Type column) must key off `kind`.
 * Matching on `name` breaks the moment someone renames "Lighting" to
 * "Lighting - Interior", and blocks having two lighting sections in one area.
 *
 * `kind` is nullable — a section the user invented has no kind and gets generic
 * behavior. Adding a kind here does not require a migration; the column is plain
 * text and this list is the vocabulary.
 */

export const SECTION_KINDS = [
  { kind: "lighting", label: "Lighting" },
  { kind: "lighting_control", label: "Lighting Control" },
  { kind: "branch_power", label: "Branch Power" },
  { kind: "hvac", label: "HVAC" },
  { kind: "equipment", label: "Equipment" },
  { kind: "primary", label: "Primary" },
  { kind: "distribution", label: "Distribution" },
  { kind: "em_distribution", label: "Em Distribution" },
  { kind: "tele_data", label: "Tele/Data" },
  { kind: "fire_alarm", label: "Fire Alarm" },
  { kind: "audio_visual", label: "Audio/Visual" },
  { kind: "security", label: "Security" },
  { kind: "grounding", label: "Grounding" },
  { kind: "temp_power", label: "Temporary Power" },
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number]["kind"];

/** Sections seeded into every new area, in order. */
export const DEFAULT_SECTIONS: readonly { name: string; kind: SectionKind }[] =
  SECTION_KINDS.map((s) => ({ name: s.label, kind: s.kind }));

export function sectionKindLabel(kind: string | null): string {
  return SECTION_KINDS.find((s) => s.kind === kind)?.label ?? "Custom";
}

/**
 * Best-guess kind for a newly created section, from what the user typed.
 * Used only at insert time — never to re-derive kind for an existing section,
 * which would defeat the point of storing it.
 */
export function inferSectionKind(name: string): SectionKind | null {
  const n = name.trim().toLowerCase();
  const hit = SECTION_KINDS.find((s) => s.label.toLowerCase() === n);
  return hit?.kind ?? null;
}
