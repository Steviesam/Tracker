/**
 * Categories, as tags rather than one string per creator.
 *
 * Sheets write a creator's category as a run-on: `Fashion/lifestyle/ugc`, `Lifestyle/blog`,
 * `City Page (pune)`. Stored whole, each spelling becomes its own filter option — one real
 * sheet produced 146 categories for 4,325 creators, so picking "Lifestyle" returned the 116
 * who happened to be typed that exact way and missed the 1,400 typed `Fashion/lifestyle`.
 *
 * Splitting on the separators and mapping each part to a canonical name turns that into a
 * short list where a choice means what it says. A creator carries every tag that applies.
 */

/** Comparison key: casing, spacing and punctuation all vary, none of them meaningfully. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Spellings that mean the same category. Sheets say `Citypage`, `City Page` and
 * `City Page (pune)` for one thing, and `Comedian`, `Memes` and `Standupcomedian` for
 * another.
 */
const GROUPS: Record<string, string[]> = {
  "City Page": ["city page", "citypage", "city pages", "citypages", "city based", "local page"],
  Fashion: ["fashion", "fashion blogger", "style", "styling", "stylist", "outfit", "ootd"],
  Lifestyle: ["lifestyle", "life style", "lifestyle blogger", "daily life"],
  UGC: ["ugc", "ugc creator", "user generated content"],
  Comedy: [
    "comedy",
    "comedian",
    "comedy page",
    "memes",
    "meme",
    "meme page",
    "standup",
    "stand up",
    "standup comedian",
    "standup comedy",
    "funny",
    "humour",
    "humor",
    "roast",
    "entertainment",
  ],
  Food: [
    "food",
    "food vlogger",
    "food blogger",
    "foodie",
    "food review",
    "cooking",
    "recipe",
    "recipes",
    "chef",
    "cafe",
    "restaurant",
    "baking",
  ],
  Parenting: ["parenting", "mom", "mom blogger", "mommy", "momlife", "dad", "kids", "baby"],
  Fitness: ["fitness", "gym", "workout", "bodybuilding", "yoga", "trainer"],
  Travel: [
    "travel",
    "travel blogger",
    "travelling",
    "traveling",
    "traveller",
    "traveler",
    "tourism",
    "wanderlust",
    "adventure",
  ],
  Beauty: ["beauty", "makeup", "make up", "mua", "makeup artist", "skincare", "cosmetics"],
  Education: [
    "education",
    "educational",
    "teacher",
    "study",
    "exam",
    "upsc",
    "coaching",
    "learning",
    "student",
  ],
  Business: ["business", "entrepreneur", "startup", "marketing", "ecommerce", "corporate"],
  Health: [
    "health",
    "doctor",
    "medical",
    "healthcare",
    "wellness",
    "nutrition",
    "dietician",
    "dietitian",
    "mental health",
    "nurse",
  ],
  "Home Decor": ["home decor", "homedecor", "interior", "interior design", "decor", "furniture"],
  Vlogger: ["vlog", "vlogs", "vlogger", "daily vlog"],
  Blogger: ["blog", "blogs", "blogger"],
  Celebrity: ["celeb", "celebs", "celebrity", "actor", "actress", "public figure"],
  Information: ["information", "infomation", "informative", "facts", "knowledge", "gk"],
  Photography: ["photography", "photographer", "photo", "photoshoot"],
  Art: ["art", "artist", "painting", "sketch", "craft", "diy", "handmade"],
  Music: ["music", "singer", "singing", "musician", "rapper", "song"],
  Dance: ["dance", "dancer", "dancing", "choreographer"],
  Tech: ["tech", "technology", "gadgets", "mobile", "coding", "developer", "software", "ai"],
  Gaming: ["gaming", "gamer", "games", "esports"],
  Finance: [
    "finance",
    "stock",
    "stocks",
    "share market",
    "trading",
    "investing",
    "investment",
    "crypto",
    "money",
  ],
  Motivation: ["motivation", "motivational", "inspiration", "quotes", "self improvement"],
  Astrology: ["astrology", "astrologer", "tarot", "numerology", "vastu"],
  Devotional: ["devotional", "bhakti", "spiritual", "spirituality", "religious", "temple"],
  Pets: ["pets", "pet", "dog", "dogs", "cat", "cats", "animal", "animals"],
  Automobile: ["automobile", "auto", "car", "cars", "bike", "bikes", "automotive", "riding"],
  Sports: ["sports", "sport", "cricket", "football", "athlete", "kabaddi"],
  News: ["news", "journalist", "media", "current affairs", "reporter"],
  Wedding: ["wedding", "bridal", "bride", "wedding planner"],
  "Real Estate": ["real estate", "realestate", "property", "realtor"],
  Agriculture: ["agriculture", "farming", "farmer", "kisan"],
  Law: ["law", "lawyer", "advocate", "legal"],
  Model: ["model", "modelling", "modeling"],
  Influencer: ["influencer", "creator", "content creator", "digital creator"],
};

const CANONICAL = new Map<string, string>();
for (const [label, spellings] of Object.entries(GROUPS)) {
  CANONICAL.set(key(label), label);
  for (const spelling of spellings) CANONICAL.set(key(spelling), label);
}

/** Longest name we treat as a category; beyond this the cell is a sentence, not a label. */
const MAX_LENGTH = 40;

/**
 * A cell that names no category: a number, a handle, a link, or a stray character. Kept out
 * so the dropdown lists categories rather than whatever else landed in the column.
 */
function isJunk(part: string): boolean {
  if (part.length < 2 || part.length > MAX_LENGTH) return true;
  if (!/[a-z]/i.test(part)) return true;
  if (/^@/.test(part) || /https?:\/\//i.test(part) || /\.(com|in|net|org)\b/i.test(part)) {
    return true;
  }
  return false;
}

/** Title case for categories we do not recognise, so they still read as labels. */
function titleCase(part: string): string {
  return part
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Splits one category cell into canonical tags.
 *
 * `Fashion/lifestyle/ugc` becomes Fashion, Lifestyle and UGC — the creator is all three, and
 * each filter choice should find them. A parenthetical city in `City Page (pune)` is dropped:
 * it repeats what the city column already holds and would otherwise split one category into
 * a dozen.
 *
 * Categories we have no mapping for are kept, title-cased, rather than discarded. An
 * unfamiliar category is still the user's data; only cells that name no category at all are
 * dropped.
 */
export function toNiches(raw: string): string[] {
  if (!raw) return [];
  // A URL in the category column is a misplaced profile link, not a category. Checked
  // before the split, because `https://…` would otherwise become the tag `Https:`.
  if (/https?:\/\//i.test(raw) || /\.(com|in|net|org)\//i.test(raw)) return [];

  const withoutParentheticals = raw.replace(/\([^)]*\)/g, " ");
  const tags: string[] = [];

  for (const piece of withoutParentheticals.split(/[/,|+&·•;]|\band\b/i)) {
    const part = piece.trim().replace(/\s+/g, " ");
    if (!part || isJunk(part)) continue;

    const canonical = CANONICAL.get(key(part));
    const tag = canonical ?? titleCase(part);
    if (!tags.includes(tag)) tags.push(tag);
  }

  return tags;
}
