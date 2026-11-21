import { ChainApi } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";

/**
 * SilentSwap volume adapter.
 *
 * SilentSwap is a privacy-preserving cross-chain swap protocol. The on-chain
 * gateway contracts route per-order funds and intentionally are not exposed
 * to indexers — surfacing them would leak the user-level activity that the
 * protocol is designed to keep private.
 */

const STATS_CONTRACT = "0x5894a9B8B342BDb1AD7570C3656eE406eE26f676"; // BNB mainnet, deployed 2026-05-25
// The contract was backfilled: the first row it holds is 2025-11-30. Days before this have no
// snapshot by design, not due to a stall.
const FIRST_SNAPSHOT_DATE = 20251130n;

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
  // startOfDay is the UTC midnight of the day being reported. startTimestamp is not usable here:
  // for v1 adapters it sits one second before midnight, which resolved to the previous day's row.
  const { startOfDay } = options;

  const date = toYYYYMMDD(startOfDay);
  const prevDate = toYYYYMMDD(startOfDay - ONE_DAY_SECONDS);

  // Read at the latest block: the full daily series is persisted in current
  // storage keyed by YYYYMMDD, and the contract did not exist before 2026, so
  // historical-block reads of pre-deployment date keys would return 0.
  const bscApi = new ChainApi({ chain: CHAIN.BSC });

  const inflowData = await bscApi.multiCall({
    abi: volumeByDateAbi,
    calls: [
      { target: STATS_CONTRACT, params: [date.toString()] },
      { target: STATS_CONTRACT, params: [prevDate.toString()] },
    ],
  });

  // publishedAt == 0 means this date's row was never written at all (the
  // struct's default value) - a genuine "no volume that day" snapshot always
  // has a real publishedAt timestamp. This is exactly the failure mode that
  // caused issue #8100 (a stalled keeper left ~10 days unpublished, which the
  // old code silently reported as $0/day instead of surfacing the outage).
  // multiCall returns uint values as decimal strings, so convert before comparing.
  const [today, yesterday] = inflowData.map((row: any) => ({
    inflowUsd: BigInt(row.inflowUsd),
    publishedAt: BigInt(row.publishedAt),
  }));

  if (today.publishedAt === 0n) {
    throw new Error(
      `silentswap: no snapshot published yet for ${date} (publishedAt=0) - ` +
      `stats keeper may be stalled, not a genuine zero-volume day`,
    );
  }
  if (prevDate >= FIRST_SNAPSHOT_DATE && yesterday.publishedAt === 0n) {
    throw new Error(
      `silentswap: no snapshot published yet for prior day ${prevDate} ` +
      `(publishedAt=0) - cannot compute a valid delta against it`,
    );
  }
  // A prevDate before FIRST_SNAPSHOT_DATE has publishedAt=0 by design. inflowUsd is then 0,
  // so delta = inflowsTillToday, the full first day's volume.

  const inflowsTillToday = today.inflowUsd;
  const inflowsTillYesterday = yesterday.inflowUsd;

  // Clamp to >=0 as a secondary safety net for any other edge case (e.g. a
  // genuine on-chain correction) - the publishedAt checks above now catch the
  // actual outage scenario loudly instead of silently clamping it to 0.
  const delta = inflowsTillToday - inflowsTillYesterday;
  const dailyInflows = delta > 0n ? delta : 0n;

  return {
    dailyBridgeVolume: Number(dailyInflows) / 1e6,
  };
};

const methodology = {
  Volume: "Anonymized inflow series read from the SilentSwapStats " +
    "reporter contract on BNB Chain (" + STATS_CONTRACT + "). " +
    "dailyVolume = volumeByDate(date).inflowUsd − " +
    "volumeByDate(date-1).inflowUsd (clamped to ≥0). DefiLlama " +
    "accumulates the running total from this daily series. " +
    "Per-order gateway addresses are intentionally not exposed " +
    "to preserve user privacy.",
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CHAIN_GLOBAL], // data from all chains but stored on BNB Chain
  start: "2025-12-02",
  fetch,
  methodology,
};

export default adapter;
