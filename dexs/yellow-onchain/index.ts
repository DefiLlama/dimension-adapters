// Yellow Onchain (https://onchain.yellow.pro): a social trading app on the XRP Ledger. Every transaction the app builds
// carries SourceTag 58900000 (88888888 from 2026-11-03 to 2026-11-05): the Batch (ALLORNOTHING), each inner transaction, and a lone OfferCreate.
// A swap is one OfferCreate (tfSell | tfFillOrKill) against XRP that crosses the XRPL AMM pools and the order book, so
// the XRPL DEX (dexs/xrpl-dex) counts the same trade: doublecounted.
//
// Volume = the XRP side of each tagged OfferCreate that applied (tesSUCCESS; a FillOrKill offer that doesn't fill ends
// tecKILLED and moves nothing), read from the trader's own AccountRoot balance change in the metadata, with the network
// fee added back (0 on Batch inner transactions). Buy: XRP spent. Sell: XRP received. The outer Batch row carries the
// tag too but is not an OfferCreate, so nothing counts twice. Window: the UTC day by ledger close (`ledger_close_date`,
// the table's partition column).
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const SOURCE_TAG = 58900000; // set by the app on every transaction it builds since 2026-11-05; sample tx in the PR
// The app's tag from 2026-11-03 until it moved to 58900000 on 2026-11-05 (Bithomp already used 88888888 for another
// app's name). Counted only up to the end of that day, so no later 88888888 traffic is taken for Yellow Onchain's.
const OLD_SOURCE_TAG = 88888888;
const OLD_TAG_UNTIL = "2026-11-06"; // first UTC day the old tag is no longer counted
// Yellow Onchain's own wallets (https://onchain.yellow.pro/.well-known/xrp-ledger.toml): their swaps are not users'
const OWN_ACCOUNTS = [
  "rH2Nst52mNKRgmKVp2TzRVNgZGBNxSdj28", // platform fee account
  "rpsWtAtg2mJQkbypLGAdHXHP2P86kLnPEv", // referral rewards account
];
const INDEXING_DELAY = 10 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  if (options.toTimestamp > Date.now() / 1e3 - INDEXING_DELAY)
    throw new Error("End timestamp is less than 10 hours ago, skipping due to Dune indexing delay");
  const tags = options.dateString < OLD_TAG_UNTIL ? [SOURCE_TAG, OLD_SOURCE_TAG] : [SOURCE_TAG];
  const rows = await queryDuneSql(options, `
    SELECT COUNT(*) AS swaps,
      SUM(ABS(
        CAST(json_extract_scalar(n, '$.ModifiedNode.FinalFields.Balance.value') AS DECIMAL(38, 0))
        - CAST(json_extract_scalar(n, '$.ModifiedNode.PreviousFields.Balance.value') AS DECIMAL(38, 0))
        + CAST(t.fee AS DECIMAL(38, 0))
      )) / 1e6 AS volume_xrp
    FROM xrpl.transactions t
    CROSS JOIN UNNEST(CAST(json_extract(t.metadata, '$.AffectedNodes') AS ARRAY(JSON))) AS u(n)
    WHERE t.ledger_close_date = DATE '${options.dateString}'
      AND t.source_tag IN (${tags.join(", ")})
      AND t.transaction_type = 'OfferCreate'
      AND t.result = 'tesSUCCESS'
      AND t.account NOT IN (${OWN_ACCOUNTS.map((a) => `'${a}'`).join(", ")})
      AND json_extract_scalar(n, '$.ModifiedNode.LedgerEntryType') = 'AccountRoot'
      AND json_extract_scalar(n, '$.ModifiedNode.FinalFields.Account') = t.account
      AND json_extract_scalar(n, '$.ModifiedNode.PreviousFields.Balance.value') IS NOT NULL
  `);
  // COUNT(*) always returns one row; none means Dune didn't answer.
  if (!rows?.length || rows[0].swaps == null) throw new Error(`No Dune result for Yellow Onchain on ${options.dateString}`);

  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("ripple", Number(rows[0].volume_xrp ?? 0));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: "2026-11-04", // the first full day with the SourceTag (88888888, then 58900000 from 2026-11-05); untagged swaps are not counted
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: "XRP side of every swap made in Yellow Onchain and settled on the XRP Ledger's native DEX (AMM pools and order book), found by the app's SourceTag (58900000; 88888888 from 2026-11-03 to 2026-11-05) and taken from the trader's XRP balance change. The same trades are counted by the XRPL DEX, so the volume is marked double counted.",
  },
};

export default adapter;
