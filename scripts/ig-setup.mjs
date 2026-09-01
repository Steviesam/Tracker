#!/usr/bin/env node
/**
 * Instagram setup helper.
 *
 * Takes the short-lived token from Graph API Explorer and does the fiddly parts:
 * exchanges it for a long-lived one, finds the Instagram professional account id behind
 * your Facebook Page, and proves Business Discovery works against a real creator.
 *
 * Usage:
 *   node scripts/ig-setup.mjs <SHORT_LIVED_TOKEN> <APP_ID> <APP_SECRET> [test-username]
 */

const GRAPH = "https://graph.facebook.com/v21.0";

const [, , token, appId, appSecret, testUsername = "nasa"] = process.argv;

if (!token || !appId || !appSecret) {
  console.error(`
Missing arguments.

  node scripts/ig-setup.mjs <SHORT_LIVED_TOKEN> <APP_ID> <APP_SECRET> [test-username]

Get the token from https://developers.facebook.com/tools/explorer with these
permissions: instagram_basic, pages_show_list, pages_read_engagement.
App id and secret are in your app's Settings > Basic.
`);
  process.exit(1);
}

async function get(path) {
  const response = await fetch(`${GRAPH}${path}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body;
}

function fail(step, error) {
  console.error(`\n✗ ${step}\n  ${error.message}\n`);
  process.exit(1);
}

console.log("\nInstagram setup\n===============\n");

// 1. Long-lived token — the short-lived one from the Explorer expires within the hour.
let longLived;
try {
  const body = await get(
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(token)}`,
  );
  longLived = body.access_token;
  const days = body.expires_in ? Math.round(body.expires_in / 86400) : 60;
  console.log(`1. Long-lived token obtained (valid ~${days} days).`);
} catch (error) {
  fail("Could not exchange the token. Check the app id and secret.", error);
}

// 2. The Instagram professional account hangs off a Facebook Page.
let pages;
try {
  const body = await get(`/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(longLived)}`);
  pages = body.data ?? [];
  console.log(`2. Found ${pages.length} Facebook Page(s).`);
} catch (error) {
  fail("Could not list your Facebook Pages.", error);
}

const linked = pages.filter((page) => page.instagram_business_account);
if (linked.length === 0) {
  console.error(`
✗ No Facebook Page has an Instagram professional account linked.

  Fix this in the Instagram app:
    Settings > Account type and tools > Switch to professional account
    then connect it to a Facebook Page.
`);
  process.exit(1);
}

for (const page of linked) {
  console.log(`   - ${page.name}: IG account ${page.instagram_business_account.id}`);
}

const igUserId = linked[0].instagram_business_account.id;

// 3. Prove Business Discovery actually works before wiring it into the app.
try {
  const fields = `business_discovery.username(${testUsername}){username,media{permalink,like_count,comments_count,view_count,timestamp}}`;
  const body = await get(`/${igUserId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(longLived)}`);
  const media = body.business_discovery?.media?.data ?? [];
  console.log(`3. Business Discovery works — read ${media.length} posts from @${testUsername}.`);

  const sample = media[0];
  if (sample) {
    console.log(
      `   Sample: likes=${sample.like_count ?? "N/A"} comments=${sample.comments_count ?? "N/A"} views=${sample.view_count ?? "N/A"} date=${(sample.timestamp ?? "").slice(0, 10)}`,
    );
  }
} catch (error) {
  fail(
    `Business Discovery failed. The app usually needs instagram_basic and pages_read_engagement, and @${testUsername} must be a public professional account.`,
    error,
  );
}

console.log(`
Done. Add these to simple-tracker/.env:

INSTAGRAM_ACCESS_TOKEN=${longLived}
INSTAGRAM_USER_ID=${igUserId}
INSTAGRAM_OEMBED_TOKEN=${appId}|<client-token from Settings > Advanced>

Then restart the server. The oEmbed token is what lets the app resolve a bare
/reel/CODE/ URL to its creator, so you never have to supply usernames.
`);
