// DefiLlama dimension adapter for Cantex (volume + fees).
// Submit as dexs/cantex/index.ts in https://github.com/DefiLlama/dimension-adapters
// (see README.md in this directory).

import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const VOLUME_URL = "https://api.cantex.io/v1/public/volume";
const CANTON_COIN_CG_ID = "canton-network";

type VolumeResponse = {
  data: {
    start_time: string;
    end_time: string;
    swap_count: string;
    volume_cc: string;
    fees_cc: string;
    lp_fees_cc: string;
    protocol_fees_cc: string;
  };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  // DefiLlama v2 supplies an inclusive window; the Cantex endpoint takes a
  // half-open [start, end), so normalize the lower bound (same as Temple).
  const startTime = new Date((options.startTimestamp + 1) * 1000).toISOString();
  const endTime = new Date(options.endTimestamp * 1000).toISOString();
  const params = new URLSearchParams({ start_time: startTime, end_time: endTime });
  const response: VolumeResponse = await fetchURL(`${VOLUME_URL}?${params}`);

  const d = response?.data;
  const volumeCC = Number(d?.volume_cc);
  const feesCC = Number(d?.fees_cc);
  const lpFeesCC = Number(d?.lp_fees_cc);
  const protocolFeesCC = Number(d?.protocol_fees_cc);
  if (![volumeCC, feesCC, lpFeesCC, protocolFeesCC].every((v) => Number.isFinite(v) && v >= 0))
    throw new Error("cantex: volume response malformed");

  // Every Cantex pool is CC-paired, so the CC leg of each swap single-counts
  // the volume; DefiLlama prices CC via its CoinGecko id.
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken(CANTON_COIN_CG_ID, volumeCC);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken(CANTON_COIN_CG_ID, feesCC);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addCGToken(CANTON_COIN_CG_ID, protocolFeesCC);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addCGToken(CANTON_COIN_CG_ID, lpFeesCC);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "24h swap volume across all Cantex AMM pools. Every pool is CC-paired, so volume is single-counted as the Canton Coin leg of each on-chain swap, fetched from the Cantex public API (api.cantex.io/v1/public/volume) for the requested window and priced via Canton Coin's CoinGecko listing.",
  Fees: "Swap fees charged by Cantex pools (pool fee rate applied to each swap), denominated in CC.",
  UserFees: "Same as Fees: all swap fees are paid by traders.",
  Revenue: "The protocol's share of swap fees (per-pool admin fee share).",
  ProtocolRevenue: "The protocol's share of swap fees (per-pool admin fee share).",
  SupplySideRevenue: "The liquidity providers' share of swap fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  start: "2026-06-01", // FIXME: set to the first Cantex mainnet swap date before submitting
  methodology,
};

export default adapter;
