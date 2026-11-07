// Yellow Onchain (https://onchain.yellow.pro) daily traders and swaps on the XRP Ledger, from the same rows as
// dexs/yellow-onchain: OfferCreate transactions carrying the app's SourceTag that applied (tesSUCCESS). One swap is
// one OfferCreate, whether it went alone or inside a Batch; the outer Batch row is not counted.
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const SOURCE_TAG = 58900000; // set by the app on every transaction it builds since 2026-11-05
// The app's tag from 2026-11-03 until it moved to 58900000 on 2026-11-05 (Bithomp already used 88888888 for another
// app's name). Counted only up to the end of that day, so no later 88888888 traffic is taken for Yellow Onchain's.
const OLD_SOURCE_TAG = 88888888;
const OLD_TAG_UNTIL = "2026-11-06"; // first UTC day the old tag is no longer counted
// Yellow Onchain's own wallets are not users (same list as dexs/yellow-onchain)
const OWN_ACCOUNTS = [
  "rH2Nst52mNKRgmKVp2TzRVNgZGBNxSdj28", // platform fee account
  "rpsWtAtg2mJQkbypLGAdHXHP2P86kLnPEv", // referral rewards account
];
// Dune rewrites xrpl.transactions in batches (seen at 13:19 and ~23:20 UTC), so a day queried right after it ends can
// be missing its last ledgers, and a stored v1 day is never fetched again.
const INDEXING_DELAY = 10 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  if (options.toTimestamp > Date.now() / 1e3 - INDEXING_DELAY)
    throw new Error("End timestamp is less than 10 hours ago, skipping due to Dune indexing delay");
  const tags = options.dateString < OLD_TAG_UNTIL ? [SOURCE_TAG, OLD_SOURCE_TAG] : [SOURCE_TAG];
  // ledger_close_date is the table's partition column: the UTC day by ledger close
  const rows = await queryDuneSql(options, `
    SELECT COUNT(DISTINCT account) AS active_users, COUNT(*) AS swaps
    FROM xrpl.transactions
    WHERE ledger_close_date = DATE '${options.dateString}'
      AND source_tag IN (${tags.join(", ")})
      AND transaction_type = 'OfferCreate'
      AND result = 'tesSUCCESS'
      AND account NOT IN (${OWN_ACCOUNTS.map((a) => `'${a}'`).join(", ")})
  `);
  const row = rows?.[0];
  if (!row || row.swaps == null) throw new Error(`No Dune result for Yellow Onchain users on ${options.dateString}`);

  return {
    dailyActiveUsers: Number(row.active_users),
    dailyTransactionsCount: Number(row.swaps),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: "2026-11-04", // the first full day with the SourceTag (88888888, then 58900000 from 2026-11-05)
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
