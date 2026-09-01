/**
 * The dashboard's navigation. Adding a feature means adding an entry here and a matching
 * case in the dashboard's section switch — nothing else in the shell needs to change.
 */

export type SectionId = "links" | "engagement" | "discovery";

export type Section = {
  id: SectionId;
  label: string;
  /** Shown under the heading, so each section explains itself. */
  description: string;
};

export const SECTIONS: Section[] = [
  {
    id: "links",
    label: "Metrics",
    description: "Upload a file or paste links, then pull public views, likes and comments.",
  },
  {
    id: "engagement",
    label: "Engagement",
    description: "Recent-video averages and engagement rate for each creator in your results.",
  },
  {
    id: "discovery",
    label: "Discovery",
    description: "Find Instagram creators in your directory by location, niche and audience size.",
  },
];

export function sectionById(id: SectionId): Section {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}

export const DEFAULT_SECTION: SectionId = "links";

/** Narrows an unchecked value — a URL parameter — to a section we actually have. */
export function toSectionId(value: string | null | undefined): SectionId | null {
  return SECTIONS.some((section) => section.id === value) ? (value as SectionId) : null;
}
