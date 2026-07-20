import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";
// DeFa — daily USDC inflow (capital deployed) into DeFa's real-world-credit pools.
//
// - Invoice financing on Stellar / ZigChain / Starknet: the on-chain TVL loggers expose a
//   cumulative "raised" figure. Stellar/Soroban RPC can't serve historical state, so these
//   are snapshotted daily into Dune (dune.defa_im.raised_daily) and we take the day-over-day
//   increase. (Requested by maintainer: Dune only for the chains where historical is hard.)
// - PSP/PayFi lending on Ethereum: read on-chain directly — USDC Transfer logs into the
//   DeFa PayFi address = that day's inflow. No Dune dependency.
//
// DefiLlama accumulates the dailies into cumulative volume (monotonic).

const DEFA_ETH = "0x182D16434faa044B9216A490CF0955B04AE16904";

// Stellar / ZigChain / Starknet — one Dune query for all Dune-backed chains.
//
// Fallback reference (in case Dune is ever unavailable): each chain's cumulative "raised"
// comes from an on-chain TVL logger contract that our snapshotter reads daily into Dune.
// The raw on-chain values can be read directly from these, no Dune needed:
//   Stellar (Soroban) : CDVVH3KWXWLVUO5OLLBBZSCZICV46PDKYA2G2HYBTWH4A6EJWTBRIXRK
//                       fn get_tvl() -> raised_in_overall_pools, 7 decimals
//   ZigChain (CosmWasm): zig19pp9rxhqktgpf2yqkwwx6yekmgvnu3hvj0c4e5rlpw88l0shh3qs9qcdyg
//                       query {tvl:{}} -> raised_in_overall_pools, 6 decimals
//   Starknet (Cairo)  : 0x0595a45952ef488d49342cd4fdf062482ab51c0718fcd8c11ff6614034b0939d
//                       fn get_tvl_snapshot() -> total_deposited (1st field), 6 decimals
const prefetch = async (options: FetchOptions) => {
  const query = `
    WITH daily AS (
      SELECT chain, date, MAX(raised_usd) AS raised_usd     -- dedup re-runs: latest per day
      FROM dune.defa_im.raised_daily
      WHERE chain != 'ethereum'                             -- Ethereum is read on-chain below
      GROUP BY chain, date
    ),
    delta AS (
      SELECT chain, date,
             COALESCE(raised_usd - LAG(raised_usd) OVER (PARTITION BY chain ORDER BY date), raised_usd) AS daily_raised
      FROM daily
    )
    SELECT chain, COALESCE(SUM(daily_raised), 0) AS daily_raised
    FROM delta
    -- 'date' is a unix-seconds bigint (not a SQL DATE), so compare directly to the unix bounds
    WHERE date >= ${options.startTimestamp} AND date < ${options.endTimestamp}
    GROUP BY chain
  `;
  return queryDuneSql(options, query);
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Ethereum (PSP/PayFi): daily USDC inflow from on-chain Transfer logs into the DeFa address.
  if (options.chain === CHAIN.ETHEREUM) {
    await addTokensReceived({
      target: DEFA_ETH,
      options,
      token: ADDRESSES[CHAIN.ETHEREUM].USDC,
      balances: dailyVolume,
    });
    return { dailyVolume };
  }

  // Stellar / ZigChain / Starknet: from the daily Dune snapshot (prefetched).
  // A day with no snapshot row = no recorded inflow that day = 0 volume (not an error).
  // The delta is a LAG over whichever days exist, so a later snapshot still captures any
  // inflow from a skipped day — cumulative volume stays correct with no gaps in the series.
  const rows: { chain: string; daily_raised: number }[] = options.preFetchedResults || [];
  const row = rows.find((r) => r.chain === options.chain);
  if (row) dailyVolume.addUSDValue(Number(row.daily_raised));
  return { dailyVolume };
};

const methodology = {
  Volume:
    "Daily USDC inflow into DeFa's real-world-credit pools. Invoice financing on Stellar, ZigChain and Starknet: from the on-chain TVL loggers (snapshotted daily to Dune, day-over-day delta). PSP/PayFi lending on Ethereum: USDC Transfer logs into the DeFa PayFi address, read on-chain. DefiLlama accumulates into cumulative volume (monotonic).",
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2026-04-11" }, // first PSP inflow — backfills full history
    [CHAIN.STELLAR]: { start: "2026-07-04" },
    [CHAIN.STARKNET]: { start: "2026-07-04" },
    zigchain: { start: "2026-07-04" },
  },
};

export default adapter;
