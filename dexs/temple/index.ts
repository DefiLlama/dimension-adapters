import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE_URL = "https://api.templedigitalgroup.com/api/exchange";
const SETTLED_VOLUME_URL = `${API_BASE_URL}/settled_volume`;
const MAKER_FEE_BPS = 0.5;
const TAKER_FEE_BPS = 1;
const BPS = 10000;

type SettledVolumeResponse = {
  start_time: string;
  end_time: string;
  total_volume_usd: number;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const requestStartTimestamp = options.startTimestamp + 1;
  const startTime = new Date(requestStartTimestamp * 1000).toISOString();
  const endTime = new Date(options.endTimestamp * 1000).toISOString();
  const params = new URLSearchParams({
    start_time: startTime,
    end_time: endTime,
  });
  const response: SettledVolumeResponse = await fetchURL(
    `${SETTLED_VOLUME_URL}?${params}`,
  );
  const dailyVolume = Number(response?.total_volume_usd);
  if (
    !response ||
    Date.parse(response.start_time) !== requestStartTimestamp * 1000 ||
    Date.parse(response.end_time) !== options.endTimestamp * 1000 ||
    !Number.isFinite(dailyVolume) ||
    dailyVolume < 0
  )
    throw new Error("Temple settled volume response malformed or mismatched");

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyVolume * MAKER_FEE_BPS / BPS, "Maker Fees");
  dailyFees.addUSDValue(dailyVolume * TAKER_FEE_BPS / BPS, "Taker Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Settled spot orderbook volume across Temple markets quoted in the USD-pegged USDA and USDCx assets. Temple aggregates current and legacy markets for the requested half-open time window.",
  Fees: "Trading fees charged by the Temple orderbook: 0.5 bps maker + 1 bp taker = 1.5 bps applied to settled volume.",
  Revenue: "All trading fees are retained by the protocol.",
  ProtocolRevenue: "All trading fees are retained by the protocol.",
  SupplySideRevenue: "Zero. No trading-fee share is paid to liquidity providers or market makers.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "0.5 bps maker fee applied to settled volume.",
    "Taker Fees": "1 bp taker fee applied to settled volume.",
  },
  Revenue: {
    "Maker Fees": "0.5 bps maker fee applied to settled volume.",
    "Taker Fees": "1 bp taker fee applied to settled volume.",
  },
  ProtocolRevenue: {
    "Maker Fees": "0.5 bps maker fee applied to settled volume.",
    "Taker Fees": "1 bp taker fee applied to settled volume.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  start: "2025-12-18",
  // One bounded aggregate request is made for each daily backfill window.
  pullHourly: false,
  methodology,
  breakdownMethodology,
};

export default adapter;
