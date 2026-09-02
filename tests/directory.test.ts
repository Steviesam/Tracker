import { describe, expect, it } from "vitest";
import { looksLikeHeaderRow, mapColumns, normaliseHeader } from "@/lib/directory/columns";
import { toNiches } from "@/lib/directory/niches";
import { formatPhone, telHref, whatsAppHref } from "@/lib/format";
import {
  resolvePlace,
  toEmail,
  toFollowers,
  toLabel,
  toPhone,
  toRupees,
  toUsername,
} from "@/lib/directory/normalise";

describe("toNiches", () => {
  it("splits a run-on cell so each category is its own filter option", () => {
    expect(toNiches("Fashion/lifestyle/ugc")).toEqual(["Fashion", "Lifestyle", "UGC"]);
  });

  it("merges spellings that mean the same category", () => {
    expect(toNiches("Citypage")).toEqual(["City Page"]);
    expect(toNiches("City Page (pune)")).toEqual(["City Page"]);
    expect(toNiches("Comedian")).toEqual(["Comedy"]);
    expect(toNiches("Food Vlogger")).toEqual(["Food"]);
    expect(toNiches("Doctor")).toEqual(["Health"]);
  });

  it("drops a parenthetical city that repeats what the city column already holds", () => {
    expect(toNiches("City Page (ahmedabad)")).toEqual(["City Page"]);
  });

  it("keeps a category it does not recognise rather than discarding it", () => {
    expect(toNiches("Pottery")).toEqual(["Pottery"]);
  });

  it("drops cells that name no category", () => {
    expect(toNiches("")).toEqual([]);
    expect(toNiches("12345")).toEqual([]);
    expect(toNiches("@someone")).toEqual([]);
    expect(toNiches("https://instagram.com/x")).toEqual([]);
  });
});

describe("resolvePlace", () => {
  it("keeps a correctly filed pair, canonicalising both", () => {
    expect(resolvePlace("bihar", "patna")).toEqual({
      state: "Bihar",
      city: "Patna",
      stateDerived: false,
    });
  });

  it("moves a city typed under State into the City column", () => {
    expect(resolvePlace("CHENNAI", "")).toEqual({
      state: "Tamil Nadu",
      city: "Chennai",
      stateDerived: true,
    });
  });

  it("moves a state typed under City into the State column", () => {
    expect(resolvePlace("", "Kerala")).toEqual({
      state: "Kerala",
      city: null,
      stateDerived: false,
    });
  });

  it("fills the state in for blocks that only have a city column", () => {
    expect(resolvePlace("", "Coimbatore")).toEqual({
      state: "Tamil Nadu",
      city: "Coimbatore",
      stateDerived: true,
    });
  });

  it("splits a cell holding both places", () => {
    expect(resolvePlace("", "Mumbai, Maharashtra")).toEqual({
      state: "Maharashtra",
      city: "Mumbai",
      stateDerived: false,
    });
  });

  it("expands abbreviations and former names", () => {
    expect(resolvePlace("UP", "Noida").state).toBe("Uttar Pradesh");
    expect(resolvePlace("Orissa", "").state).toBe("Odisha");
    expect(resolvePlace("TN", "").state).toBe("Tamil Nadu");
  });

  it("merges renamed cities so a filter lists each city once", () => {
    expect(resolvePlace("", "Bangalore").city).toBe("Bengaluru");
    expect(resolvePlace("", "Bengaluru").city).toBe("Bengaluru");
    expect(resolvePlace("", "gurgaon").city).toBe("Gurugram");
    expect(resolvePlace("", "Allahabad").city).toBe("Prayagraj");
  });

  it("never overrules a state the sheet named", () => {
    // Delhi people often write their city as Noida, which is in UP. The sheet wins.
    const place = resolvePlace("Delhi", "Noida");
    expect(place.state).toBe("Delhi");
    expect(place.stateDerived).toBe(false);
  });

  it("leaves the state blank for a city name two states share", () => {
    // Aurangabad is in both Maharashtra and Bihar; guessing would misfile half of them.
    expect(resolvePlace("", "Aurangabad")).toEqual({
      state: null,
      city: "Aurangabad",
      stateDerived: false,
    });
  });

  it("keeps places it does not recognise, preferring the city column", () => {
    expect(resolvePlace("", "kishanganj")).toEqual({
      state: null,
      city: "Kishanganj",
      stateDerived: false,
    });
    expect(resolvePlace("dhanbad west", "").city).toBe("Dhanbad West");
  });

  it("returns nothing for empty cells", () => {
    expect(resolvePlace("", "")).toEqual({ state: null, city: null, stateDerived: false });
  });
});

describe("normaliseHeader", () => {
  it("strips punctuation and collapses whitespace", () => {
    expect(normaliseHeader("  Instagram_Handle  ")).toBe("instagram handle");
    expect(normaliseHeader("Follower-Count")).toBe("follower count");
    expect(normaliseHeader("City / Town")).toBe("city town");
  });
});

describe("mapColumns", () => {
  it("binds a plainly labelled sheet", () => {
    const map = mapColumns(["Username", "Name", "State", "City", "Category", "Followers"]);
    expect(map.fields).toEqual({
      username: 0,
      displayName: 1,
      state: 2,
      city: 3,
      niche: 4,
      followers: 5,
    });
    expect(map.extras).toEqual([]);
  });

  it("accepts alternative spellings and any column order", () => {
    const map = mapColumns(["Followers Count", "Niche", "Instagram Handle", "Town"]);
    expect(map.fields.followers).toBe(0);
    expect(map.fields.niche).toBe(1);
    expect(map.fields.username).toBe(2);
    expect(map.fields.city).toBe(3);
  });

  it("does not let one column serve two fields", () => {
    // "Name" could match displayName, and "Account" could match username. Each is claimed once.
    const map = mapColumns(["Account", "Name"]);
    expect(map.fields.username).toBe(0);
    expect(map.fields.displayName).toBe(1);
  });

  it("keeps unrecognised columns as extras rather than dropping them", () => {
    const map = mapColumns(["Username", "Agency", "Preferred Language"]);
    expect(map.fields.username).toBe(0);
    expect(map.extras).toEqual([1, 2]);
  });

  it("binds the contact and rate columns a sheet is likely to carry", () => {
    const map = mapColumns(["Insta", "Email ID", "Contact Number", "Rate Card"]);
    expect(map.fields.email).toBe(1);
    expect(map.fields.phone).toBe(2);
    expect(map.fields.rateCard).toBe(3);
    expect(map.extras).toEqual([]);
  });

  it("reads a bare 'Contact' column as a phone number, which is what it usually holds", () => {
    // An address in such a column is dropped by toPhone rather than stored as a number,
    // so guessing wrong here costs a field, not a wrong value.
    expect(mapColumns(["Username", "Contact"]).fields.phone).toBe(1);
  });

  it("recognises the short spellings people actually type", () => {
    // A sheet heading its column "INSTA" is not an edge case; it is the common case.
    expect(mapColumns(["CITY", "NAME", "FOLLOWERS", "INSTA"]).fields.username).toBe(3);
    expect(mapColumns(["IG", "City"]).fields.username).toBe(0);
    expect(mapColumns(["Insta Handle", "City"]).fields.username).toBe(0);
  });

  it("treats a row as a header only when a username column and a second field are present", () => {
    expect(looksLikeHeaderRow(["Instagram Handle", "City"])).toBe(true);
    expect(looksLikeHeaderRow(["State", "City", "Category"])).toBe(false);
    expect(looksLikeHeaderRow(["", "  "])).toBe(false);
    // A lone data cell reading "instagram" must not be mistaken for a header.
    expect(looksLikeHeaderRow(["instagram"])).toBe(false);
  });
});

describe("toUsername", () => {
  it("reads bare handles and @handles", () => {
    expect(toUsername("nasa")).toBe("nasa");
    expect(toUsername("@NASA")).toBe("nasa");
    expect(toUsername("  @some_creator.1 ")).toBe("some_creator.1");
  });

  it("reads a profile URL, with or without query noise", () => {
    expect(toUsername("https://www.instagram.com/nasa/")).toBe("nasa");
    expect(toUsername("instagram.com/nasa?igsh=abc123")).toBe("nasa");
  });

  it("reads a linked cell, which flattens to its display text plus the URL", () => {
    expect(toUsername("chennai vibes https://www.instagram.com/chennaivibes/")).toBe(
      "chennaivibes",
    );
    expect(toUsername("@local_madras https://instagram.com/local_madras/")).toBe("local_madras");
  });

  it("reads a handle sitting alongside other text", () => {
    expect(toUsername("chennai vibes @chennaivibes")).toBe("chennaivibes");
  });

  it("tolerates stray slashes and trailing punctuation", () => {
    expect(toUsername("aansha_gowda/")).toBe("aansha_gowda");
    expect(toUsername("/some_creator")).toBe("some_creator");
  });

  it("rejects post and reel URLs, which identify content rather than an account", () => {
    expect(toUsername("https://www.instagram.com/reel/ABC123/")).toBeNull();
    expect(toUsername("https://www.instagram.com/p/XYZ/")).toBeNull();
  });

  it("rejects anything that is not a usable handle", () => {
    expect(toUsername("")).toBeNull();
    expect(toUsername("not a handle!")).toBeNull();
    expect(toUsername("a".repeat(31))).toBeNull();
  });
});

describe("toFollowers", () => {
  it("reads plain and separated numbers", () => {
    expect(toFollowers("45000")).toBe(45_000);
    expect(toFollowers("45,000")).toBe(45_000);
    expect(toFollowers("1 200 000")).toBe(1_200_000);
    expect(toFollowers(98_765)).toBe(98_765);
  });

  it("reads shorthand suffixes", () => {
    expect(toFollowers("45k")).toBe(45_000);
    expect(toFollowers("1.2M")).toBe(1_200_000);
    expect(toFollowers("309K")).toBe(309_000);
    expect(toFollowers("10K+")).toBe(10_000);
  });

  it("returns null rather than zero for anything unreadable", () => {
    // Zero would place the creator at the bottom of every range filter as though it were a fact.
    expect(toFollowers("")).toBeNull();
    expect(toFollowers("n/a")).toBeNull();
    expect(toFollowers("about 40k")).toBeNull();
  });

  it("rejects numbers too large to be an audience", () => {
    // A phone number drifting into the followers column overflows the database column and
    // would otherwise hand every "1M+" search a creator who does not exist at that size.
    expect(toFollowers("8778006926")).toBeNull();
    expect(toFollowers(9_790_989_346)).toBeNull();
    expect(toFollowers("50B")).toBeNull();
    // The largest real accounts are a few hundred million, and those stay.
    expect(toFollowers("700M")).toBe(700_000_000);
  });
});

describe("toLabel", () => {
  it("gives inconsistent casing one canonical form, so filters group correctly", () => {
    expect(toLabel("patna")).toBe("Patna");
    expect(toLabel("PATNA")).toBe("Patna");
    expect(toLabel("  Patna  ")).toBe("Patna");
    expect(toLabel("new  delhi")).toBe("New Delhi");
  });

  it("keeps state abbreviations and known acronyms upper-case", () => {
    expect(toLabel("UP")).toBe("UP");
    expect(toLabel("up")).toBe("UP");
    expect(toLabel("NCR")).toBe("NCR");
    expect(toLabel("ugc")).toBe("UGC");
  });

  it("does not let a capitalised place name split into two filter entries", () => {
    // "GOA" preserved as an acronym would sit beside "Goa" as a separate place.
    expect(toLabel("GOA")).toBe("Goa");
    expect(toLabel("Goa")).toBe("Goa");
    expect(toLabel("WEST BENGAL")).toBe("West Bengal");
    expect(toLabel("MYSURU")).toBe("Mysuru");
  });

  it("lowercases joining words after the first", () => {
    expect(toLabel("rann of kutch")).toBe("Rann of Kutch");
  });

  it("returns null for blanks", () => {
    expect(toLabel("")).toBeNull();
    expect(toLabel("   ")).toBeNull();
  });
});

describe("toEmail", () => {
  it("reads an address out of a cell that says more than the address", () => {
    expect(toEmail("Priya <priya@agency.in>")).toBe("priya@agency.in");
    expect(toEmail("mail: hello@studio.co.in")).toBe("hello@studio.co.in");
  });

  it("takes the first when a cell lists several, rather than rejecting the cell", () => {
    expect(toEmail("a@b.com / manager@c.com")).toBe("a@b.com");
  });

  it("lowercases, so one address is not stored under two spellings", () => {
    expect(toEmail("Priya.Sharma@Agency.IN")).toBe("priya.sharma@agency.in");
  });

  it("returns null for cells holding no address", () => {
    expect(toEmail("")).toBeNull();
    expect(toEmail("NA")).toBeNull();
    expect(toEmail("dm on insta")).toBeNull();
    expect(toEmail("priya@agency")).toBeNull();
  });
});

describe("toPhone", () => {
  it("reads one number out of the many ways a sheet writes it", () => {
    expect(toPhone("9876543210")).toBe("9876543210");
    expect(toPhone("+91 98765 43210")).toBe("919876543210");
    expect(toPhone("098765-43210")).toBe("9876543210");
    expect(toPhone("(+91) 98765.43210")).toBe("919876543210");
  });

  it("keeps the first number when a cell holds two", () => {
    expect(toPhone("9876543210 / 9123456789")).toBe("9876543210");
    expect(toPhone("9876543210, 9123456789")).toBe("9876543210");
  });

  it("drops an extension, which cannot be dialled from a link anyway", () => {
    expect(toPhone("9876543210 ext 22")).toBe("9876543210");
  });

  it("refuses anything that is not a dialable number", () => {
    expect(toPhone("")).toBeNull();
    expect(toPhone("NA")).toBeNull();
    expect(toPhone("dm only")).toBeNull();
    // Too short to dial, and too long to be a real number.
    expect(toPhone("12345")).toBeNull();
    expect(toPhone("9876543210987654321")).toBeNull();
  });

  it("refuses the repeated digits people type to mean 'no number'", () => {
    expect(toPhone("0000000000")).toBeNull();
    expect(toPhone("9999999999")).toBeNull();
  });
});

describe("toRupees", () => {
  it("reads a rate written for a human", () => {
    expect(toRupees("₹50,000")).toBe(50_000);
    expect(toRupees("Rs. 25,000")).toBe(25_000);
    expect(toRupees("50k")).toBe(50_000);
    expect(toRupees("1.5 lakh")).toBe(1_50_000);
    expect(toRupees("2 cr")).toBe(2_00_00_000);
    expect(toRupees(40_000)).toBe(40_000);
  });

  it("ignores what the rate is per, since only the price is stored", () => {
    expect(toRupees("50000/reel")).toBe(50_000);
    expect(toRupees("₹25,000 per post")).toBe(25_000);
  });

  it("returns null rather than 0, which would read as 'works for free'", () => {
    expect(toRupees("")).toBeNull();
    expect(toRupees("negotiable")).toBeNull();
    expect(toRupees("TBD")).toBeNull();
    expect(toRupees(0)).toBeNull();
  });

  it("refuses a number too large to be a rate, which is how a phone number gets in", () => {
    expect(toRupees("9876543210")).toBeNull();
    expect(toRupees(9_876_543_210)).toBeNull();
  });

  it("keeps the price when the cell also mentions tax", () => {
    expect(toRupees("16000 + gst")).toBe(16_000);
    expect(toRupees("15,000 plus GST")).toBe(15_000);
  });
});

describe("rate column names used by real agency sheets", () => {
  it("recognises commercial, including the way it is usually misspelt", () => {
    for (const header of ["COMMERCIAL", "Commerical", "Commercials"]) {
      const map = mapColumns(["INSTA", header]);
      expect(map.fields.rateCard, header).toBe(1);
    }
  });

  it("takes the influencer price and leaves the brand price in notes", () => {
    // Two columns, two different numbers: what the creator asks, and what we quote the
    // brand. Storing the second as the rate card would put our margin on the creator.
    const map = mapColumns(["INSTA", "INFL PRICE (S)", "BRAND PRICE (S)"]);
    expect(map.fields.rateCard).toBe(1);
    expect(map.extras).toContain(2);
  });
});

describe("formatPhone", () => {
  it("breaks up digits so a number can be checked against a contact list", () => {
    expect(formatPhone("919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("9876543210")).toBe("98765 43210");
  });

  it("dials a bare number domestically and a prefixed one abroad", () => {
    expect(telHref("9876543210")).toBe("tel:9876543210");
    expect(telHref("919876543210")).toBe("tel:+919876543210");
  });

  it("gives WhatsApp a country code, since it has no domestic mode", () => {
    expect(whatsAppHref("9876543210")).toBe("https://wa.me/919876543210");
    expect(whatsAppHref("919876543210")).toBe("https://wa.me/919876543210");
    expect(whatsAppHref("14155552671")).toBe("https://wa.me/14155552671");
  });
});
