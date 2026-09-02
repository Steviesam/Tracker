/**
 * Maps an arbitrary spreadsheet's header row onto the directory's fields.
 *
 * Sheets come from all sorts of places, so nothing here assumes a fixed column order or a
 * single spelling. Whatever cannot be mapped is kept as notes rather than dropped.
 */

export type CreatorField =
  | "username"
  | "displayName"
  | "state"
  | "city"
  | "niche"
  | "followers"
  | "email"
  | "phone"
  | "rateCard";

export const CREATOR_FIELDS: CreatorField[] = [
  "username",
  "displayName",
  "state",
  "city",
  "niche",
  "followers",
  "email",
  "phone",
  "rateCard",
];

export const FIELD_LABEL: Record<CreatorField, string> = {
  username: "Username",
  displayName: "Name",
  state: "State",
  city: "City",
  niche: "Category / niche",
  followers: "Followers",
  email: "Email",
  phone: "Phone",
  rateCard: "Rate",
};

/**
 * Header spellings we accept, most specific first within each field.
 *
 * Order across fields matters too: `username` is checked before `displayName` so a sheet
 * with both "Instagram Handle" and "Name" binds each to the right one.
 */
const ALIASES: Record<CreatorField, string[]> = {
  username: [
    "instagram username",
    "instagram handle",
    "instagram id",
    "instagram profile",
    "instagram url",
    "instagram link",
    "instagram",
    "insta handle",
    "insta username",
    "insta id",
    "insta link",
    "insta url",
    "insta",
    "ig handle",
    "ig username",
    "ig id",
    "ig link",
    "ig",
    "username",
    "user name",
    "handle",
    "profile handle",
    "profile url",
    "profile link",
    "profile",
    "link",
    "url",
    "account",
  ],
  displayName: [
    "display name",
    "creator name",
    "influencer name",
    "full name",
    "channel name",
    "profile name",
    "page name",
    "creator",
    "influencer",
    "name",
  ],
  state: ["state", "province", "region", "state name"],
  city: ["city", "town", "district", "location", "city name", "base city", "based in"],
  niche: [
    "category",
    "niche",
    "genre",
    "vertical",
    "content category",
    "content type",
    "industry",
    "topic",
    "segment",
  ],
  followers: [
    "followers",
    "follower count",
    "followers count",
    "no of followers",
    "number of followers",
    "total followers",
    "follower",
    "subscriber count",
    "subscribers",
    "audience size",
    "audience",
    "reach",
  ],
  email: [
    "email",
    "email id",
    "email address",
    "e mail",
    "mail",
    "mail id",
    "contact email",
    "business email",
    "official email",
  ],
  /**
   * "contact" and "contact details" sit here rather than under `email` because in Indian
   * sheets an unqualified contact column is a mobile number far more often than an address
   * — and `toPhone` returns null on anything that is not one, so a stray address is dropped
   * rather than stored as a number.
   */
  phone: [
    "phone",
    "phone number",
    "phone no",
    "mobile",
    "mobile number",
    "mobile no",
    "contact number",
    "contact no",
    "contact",
    "contact details",
    "whatsapp",
    "whatsapp number",
    "whatsapp no",
    "number",
  ],
  /**
   * "commercial" is how agency sheets usually head the price column, and "commerical" is
   * how it is usually spelt — both appear in real sheets often enough to be worth matching.
   *
   * A brand price column is deliberately absent. Where a sheet carries both, the influencer
   * price is what the creator asks and the brand price is what we quote on top; storing the
   * second as the rate card would put our margin on the creator's card and misprice every
   * negotiation from then on. It stays in notes, where it is visible but not mistaken for
   * the creator's own number.
   */
  rateCard: [
    "rate",
    "rate card",
    "rates",
    "price",
    "pricing",
    "commercial",
    "commercials",
    "commerical",
    "infl price",
    "infl price s",
    "influencer price",
    "creator price",
    "charges",
    "charge",
    "cost",
    "fee",
    "fees",
    "amount",
    "budget",
    "quote",
    "quotation",
    "per post",
    "per reel",
    "reel rate",
    "reel price",
    "post rate",
    "post price",
    "story rate",
    "asking price",
  ],
};

export function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-/\\.]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ColumnMap = {
  /** Column index for each field that was recognised. */
  fields: Partial<Record<CreatorField, number>>;
  /** Indexes of columns we did not recognise, kept for the notes field. */
  extras: number[];
  /** Header text as written in the sheet, for reporting back to the user. */
  headers: string[];
};

/**
 * Binds header cells to fields. Each column is claimed at most once, and each field takes
 * the earliest column that matches one of its aliases — so a sheet listing "Name" before
 * "Instagram Handle" still resolves both correctly.
 */
export function mapColumns(headerRow: string[]): ColumnMap {
  const normalised = headerRow.map(normaliseHeader);
  const fields: Partial<Record<CreatorField, number>> = {};
  const claimed = new Set<number>();

  for (const field of CREATOR_FIELDS) {
    for (const alias of ALIASES[field]) {
      const index = normalised.findIndex(
        (header, position) => header === alias && !claimed.has(position),
      );
      if (index !== -1) {
        fields[field] = index;
        claimed.add(index);
        break;
      }
    }
  }

  const extras = normalised
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => header.length > 0 && !claimed.has(index))
    .map(({ index }) => index);

  return { fields, extras, headers: headerRow };
}

export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || cell.trim().length === 0);
}

/**
 * A header row labels columns rather than carrying data.
 *
 * Two conditions, both needed. A username column, because a table without one cannot seed
 * the directory. And a second recognised field, because a lone data cell reading
 * "instagram" would otherwise be mistaken for a header and swallow the rows beneath it.
 */
export function looksLikeHeaderRow(row: string[]): boolean {
  if (isBlankRow(row)) return false;
  const { fields } = mapColumns(row);
  return fields.username !== undefined && Object.keys(fields).length >= 2;
}
