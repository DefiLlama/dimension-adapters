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
  const { startTimestamp, toTimestamp } = options;

  const date = toYYYYMMDD(startTimestamp);
  const prevDate = toYYYYMMDD(startTimestamp - ONE_DAY_SECONDS);

  const bscApi = new ChainApi({ chain: CHAIN.BSC, timestamp: toTimestamp });

  const inflowData = await bscApi.multiCall({
    abi: volumeByDateAbi,
    calls: [
      { target: STATS_CONTRACT, params: [date.toString()] },
      { target: STATS_CONTRACT, params: [prevDate.toString()] },
    ],
  });

  const inflowsTillToday = inflowData[0].inflowUsd;
  const inflowsTillYesterday = inflowData[1].inflowUsd;

  // Clamp to >=0 (as documented in the methodology): a missing or reset
  // snapshot on either date must never produce a negative daily volume.
  const delta = inflowsTillToday - inflowsTillYesterday;
  const dailyInflows = delta > 0 ? delta : 0;

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
  start: "2026-05-29",
  fetch,
  methodology,
};

export default adapter;
