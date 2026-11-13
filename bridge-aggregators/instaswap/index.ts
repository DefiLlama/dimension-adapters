import { ChainApi } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";

/**
 * InstaSwap volume adapter.
 *
 * InstaSwap is a non-custodial cross-chain swap aggregator (live since 2018) that routes
 * orders across decentralized protocols and liquidity sources, including private settlement
 * routes. Per-order deposit and payout addresses are never exposed by design, so volume is
 * read from the InstaswapStats reporter contract on BNB Chain: one row per UTC day, written
 * once a day by the project's publisher wallet. The same figures are shown on the public
 * explorer (https://explorer.instaswap.com), and the contract source is verified on BscScan.
 */

const STATS_CONTRACT = "0x82993005910f83fb3e510d5dcc1f40beeb41afe5"; // BNB mainnet, deployed 2026-10-18
// The contract was backfilled from the explorer history: the first row it holds is 2026-01-01,
// preceded by a zero seed row for 2025-12-31. Earlier days have no snapshot by design.
const FIRST_SNAPSHOT_DATE = 20260101n;
const ONE_DAY_SECONDS = 24 * 60 * 60;

const volumeByDateAbi =
  "function volumeByDate(uint64) view returns (" +
  "uint128 cumulativeUsd, uint128 inflowUsd, uint128 outflowUsd, " +
  "uint128 dailyUsd, uint64 transferCount, uint32 tokenCount, " +
  "uint64 bnbBlock, uint64 publishedAt)";

function toYYYYMMDD(ts: number): bigint {
  const date = new Date(ts * 1000);
  return BigInt(
    date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate(),
  );
}

const fetch = async (options: FetchOptions) => {
  // With pullHourly: false the window is one UTC day, so startTimestamp is the midnight of the day being
  // reported. toYYYYMMDD floors to the UTC date either way.
  const { startTimestamp } = options;
  const date = toYYYYMMDD(startTimestamp);
  const prevDate = toYYYYMMDD(startTimestamp - ONE_DAY_SECONDS);

  // Read at the latest block: the whole daily series lives in current storage keyed by YYYYMMDD,
  // and the contract did not exist before 2026-10, so historical-block reads would return 0.
  const bscApi = new ChainApi({ chain: CHAIN.BSC });

  const rows = await bscApi.multiCall({
    abi: volumeByDateAbi,
    calls: [
      { target: STATS_CONTRACT, params: [date.toString()] },
      { target: STATS_CONTRACT, params: [prevDate.toString()] },
    ],
  });

  // publishedAt == 0 means the row was never written (struct default). A genuine zero-volume
  // day still carries a real publishedAt, so a missing row is a stalled publisher, not $0.
  const [today, yesterday] = rows.map((row: any) => ({
    inflowUsd: BigInt(row.inflowUsd),
    publishedAt: BigInt(row.publishedAt),
  }));

  if (today.publishedAt === 0n) {
    throw new Error(
      `instaswap: no snapshot published yet for ${date} (publishedAt=0) - ` +
      `stats publisher may be stalled, not a genuine zero-volume day`,
    );
  }
  if (prevDate >= FIRST_SNAPSHOT_DATE && yesterday.publishedAt === 0n) {
    throw new Error(
      `instaswap: no snapshot published yet for prior day ${prevDate} ` +
      `(publishedAt=0) - cannot compute a valid delta against it`,
    );
  }

  // The day before FIRST_SNAPSHOT_DATE is the zero seed row, so the first day's delta is its full inflow.
  const delta = today.inflowUsd - yesterday.inflowUsd;
  const dailyInflows = delta > 0n ? delta : 0n;

  return {
    dailyBridgeVolume: Number(dailyInflows) / 1e6, // contract stores micro-USD (6 decimals)
  };
};

const methodology = {
  Volume: "Daily deposit volume in USD read from the InstaswapStats reporter contract on BNB Chain (" +
    STATS_CONTRACT + "): dailyVolume = volumeByDate(date).inflowUsd - volumeByDate(date-1).inflowUsd " +
    "(micro-USD, clamped to >= 0). inflowUsd is the running total of the USD value of every completed " +
    "swap's deposit, valued at the time of the swap, across all supported chains; DefiLlama accumulates " +
    "the running total from this daily series. InstaSwap is a cross-chain aggregator: swaps that start and " +
    "end on the same chain are included in the series but are a marginal share of it (0.6% of 2026 volume, " +
    "1.36M of 212M USD as of 2026-11-12, measured on the explorer's row set). Per-order addresses are " +
    "intentionally not exposed to preserve user privacy; the same daily figures are published on " +
    "explorer.instaswap.com.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // The reporter contract holds one snapshot per UTC day, written once a day at 00:10 UTC, so there is
  // nothing finer than daily to pull.
  pullHourly: false,
  chains: [CHAIN.CHAIN_GLOBAL], // swaps span 60+ chains; the aggregate series is stored on BNB Chain
  start: "2026-01-01",
  fetch,
  methodology,
};

export default adapter;
