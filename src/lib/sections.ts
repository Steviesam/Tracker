/**
 * The dashboard's navigation. Adding a feature means adding an entry here and a matching
 * case in the dashboard's section switch — nothing else in the shell needs to change.
 */

export type SectionId = "campaigns" | "links" | "engagement" | "discovery" | "access";

export type Section = {
  id: SectionId;
  label: string;
  /** Shown under the heading, so each section explains itself. */
  description: string;
  ownerOnly?: boolean;
};

export const SECTIONS: Section[] = [
  {
    id: "campaigns",
    label: "Campaigns",
    description: "What is due today, and how every campaign is tracking.",
  },
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
  {
    id: "access",
    label: "Access",
    description: "Who can sign up. Anyone not on this list is turned away.",
    /** Hidden from everyone but the owner; the API refuses it regardless of the nav. */
    ownerOnly: true,
  },
];

/** The sections this user should see. The API is the real gate; this only hides the door. */
export function sectionsFor(isOwner: boolean): Section[] {
  return SECTIONS.filter((section) => !section.ownerOnly || isOwner);
}

export function sectionById(id: SectionId): Section {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}

/**
 * Campaigns opens first: it is the only screen that answers "what do I owe today", which is
 * the question someone has when they open the app in the morning.
 */
export const DEFAULT_SECTION: SectionId = "campaigns";

/** Narrows an unchecked value — a URL parameter — to a section we actually have. */
export function toSectionId(value: string | null | undefined): SectionId | null {
  return SECTIONS.some((section) => section.id === value) ? (value as SectionId) : null;
}
