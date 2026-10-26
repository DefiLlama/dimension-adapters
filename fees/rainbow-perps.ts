import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { fetchBuilderCodeDataV2 } from "../helpers/hyperliquid-v2";

// Rainbow's Hyperliquid builder code. Also configured in factory/hyperliquid.ts,
// which still serves rainbow-spot; this file shadows the factory for rainbow-perps
// only, to add referral fees on top of the builder-code fees.
const BUILDER_ADDRESSES = ["0x60dc8e3dad2e4e0738e813b9cb09b9c00b5e0fc9"];

const BUILDER_FEES = "Hyperliquid Builder Code Fees";
const REFERRAL_FEES = "Hyperliquid Referral Fees";

// First day present in the referral table; before it the table legitimately has no row.
const REFERRAL_START = "2026-01-13";

// One row per day, keyed on block_date (midnight UTC); fee_usd is already in USD.
const REFERRAL_SQL = (options: FetchOptions) => `
  SELECT SUM(fee_usd) AS fees
  FROM dune.rainbowdotme.rainbow_perps_referrals_daily
  WHERE block_date = DATE '${options.dateString}'
`;

// Both sources need the day to be over: the Hyperliquid indexer rejects a partial day and the
// referral table is written a day at a time. DefiLlama retries a failed day, so bail out before
// either request rather than spend a Dune query on a retry that cannot produce the full number.
const SETTLE_AFTER_MS = 4 * 60 * 60 * 1000;

const fetch = async (options: FetchOptions) => {
  if (Date.now() < options.endTimestamp * 1000 + SETTLE_AFTER_MS) {
    throw new Error(`rainbow-perps: ${options.dateString} settles at 04:00 UTC the next day`);
  }

  const { dailyVolume, dailyFees } = await fetchBuilderCodeDataV2({
    options,
    builderAddresses: BUILDER_ADDRESSES,
    market: "perps",
  });

  const fees = options.createBalances();
  fees.add(dailyFees, BUILDER_FEES);

  // SUM without GROUP BY always returns one row, null when the day is absent. The table is
  // filled a day at a time and has run up to two days behind, so a null day on or after
  // REFERRAL_START means "not loaded yet", not "no referrals" - fail instead of storing a
  // silent undercount, the way the Hyperliquid indexer rejects a partial day.
  const [row] = await queryDuneSql(options, REFERRAL_SQL(options));
  if (row?.fees == null && options.dateString >= REFERRAL_START) {
    throw new Error(`rainbow-perps: referral table has no row for ${options.dateString}`);
  }
  fees.addUSDValue(Number(row?.fees ?? 0), REFERRAL_FEES);

  return {
    dailyVolume,
    dailyFees: fees,
    dailyRevenue: fees.clone(),
    dailyProtocolRevenue: fees.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, // trades are already counted in Hyperliquid's own volume and fees
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-09-15",
  fetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Volume of Hyperliquid perps trades placed through Rainbow's builder code.",
    Fees: "Builder-code fees paid by users on Hyperliquid perps trades placed through Rainbow's builder code, plus referral fees earned on referred trades.",
    Revenue: "All builder-code and referral fees are kept by Rainbow.",
    ProtocolRevenue: "All builder-code and referral fees are kept by Rainbow.",
  },
  breakdownMethodology: {
    Fees: {
      [BUILDER_FEES]: "Builder code fees paid by users on Hyperliquid perps trades.",
      [REFERRAL_FEES]: "Referral fees earned on Hyperliquid trades referred by Rainbow.",
    },
    Revenue: {
      [BUILDER_FEES]: "Builder code fees collected by Rainbow.",
      [REFERRAL_FEES]: "Referral fees collected by Rainbow.",
    },
    ProtocolRevenue: {
      [BUILDER_FEES]: "Builder code fees collected by Rainbow.",
      [REFERRAL_FEES]: "Referral fees collected by Rainbow.",
    },
  },
};

export default adapter;
