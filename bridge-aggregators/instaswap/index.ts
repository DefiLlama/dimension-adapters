import { ChainApi } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";

// InstaswapStats reporter contract on BNB Chain (source verified on BscScan), same design as bridge-aggregators/silentswap.
// InstaSwap's publisher wallet 0x2D1C5929419c9d1b45444A2b61bB8F9dCb4ab938 writes one row per UTC day at ~00:10 UTC the
// next day. Deployed 2026-10-18 and backfilled from 2026-01-01 (zero seed row on 2025-12-31). Per-order deposit addresses
// are not exposed (private routes), so there are no swap events to index. Same figures as https://explorer.instaswap.com
const STATS_CONTRACT = "0x82993005910f83fb3e510d5dcc1f40beeb41afe5";

// USD fields are cumulative, in micro-USD. dailyUsd counts both legs (deposit + payout), so volume is the inflowUsd delta.
const volumeByDateAbi = "function volumeByDate(uint64 yyyymmdd) view returns (uint128 cumulativeUsd, uint128 inflowUsd, uint128 outflowUsd, uint128 dailyUsd, uint64 transferCount, uint32 tokenCount, uint64 bnbBlock, uint64 publishedAt)";

const toDateKey = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, "");

const fetch = async (options: FetchOptions) => {
  const days = [toDateKey(options.startOfDay - 86400), toDateKey(options.startOfDay)];

  // Read at the latest block: the whole series lives in current storage, and the contract did not exist before 2026-10-18
  const [prev, curr] = await new ChainApi({ chain: CHAIN.BSC }).multiCall({
    abi: volumeByDateAbi,
    calls: days.map((day) => ({ target: STATS_CONTRACT, params: [day] })),
  });

  // publishedAt == 0 means the row was never written (publisher has not run yet), not a zero-volume day
  [prev, curr].forEach((row, i) => {
    if (Number(row.publishedAt) === 0) throw new Error(`instaswap: no stats row published for ${days[i]}`);
  });

  const volume = BigInt(curr.inflowUsd) - BigInt(prev.inflowUsd);
  if (volume < 0n) throw new Error(`instaswap: cumulative inflow decreased on ${days[1]}`);

  return { dailyBridgeVolume: Number(volume) / 1e6 };
};

const adapter: SimpleAdapter = {
  // v1: the source is one finished row per UTC day.
  version: 1,
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL], // swaps span 60+ chains; only the aggregate series is published (on BNB Chain)
  start: "2026-01-01",
  methodology: {
    BridgeVolume: "USD value deposited into completed InstaSwap swaps across all supported chains, valued at swap time and published daily by InstaSwap to its stats contract on BNB Chain. Includes a small share of same-chain swaps, which the published series does not separate.",
  },
};

export default adapter;
