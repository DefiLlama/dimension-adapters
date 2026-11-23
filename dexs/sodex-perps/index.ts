import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_BASE = "https://data-api.sodex.com/api/defillama";
// SoDEX publishes fees up to ~12h after the day closes, so recent windows are skipped until it catches up
const PUBLICATION_DELAY = 12 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  if (options.endTimestamp > Date.now() / 1e3 - PUBLICATION_DELAY)
    throw new Error("End timestamp is less than 12 hours ago, skipping until SoDEX publishes the day");
  const volumeRes = await httpGet(`${API_BASE}/perp/volume?timestamp=${options.startOfDay}`)
  const feesRes = await httpGet(`${API_BASE}/perp/fees?timestamp=${options.startOfDay}`)

  const { dailyVolume } = volumeRes;
  if (![dailyVolume, feesRes.dailyFees, feesRes.dailyRevenue].every((v) => typeof v === 'number' && Number.isFinite(v)))
    throw new Error(`sodex-perps: invalid volume/fees response for ${options.dateString}`);
  // the API serves 0 for a day it has not published yet (fees land well after volume), so a 0 is not a real day
  if (dailyVolume <= 0 || feesRes.dailyFees <= 0 || feesRes.dailyRevenue <= 0)
    throw new Error(`sodex-perps: volume/fees for ${options.dateString} are not published yet (the API returns 0 for unpublished days)`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(feesRes.dailyFees, 'SoDEX Perps Fees');
  dailyRevenue.addUSDValue(feesRes.dailyRevenue, 'SoDEX Perps Fees To Protocol');
  dailySupplySideRevenue.addUSDValue(Number(feesRes.dailyFees) - Number(feesRes.dailyRevenue), 'SoDEX Perps Fees To LPs');
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.VALUECHAIN],
  start: "2025-10-20",
  methodology: {
    Fees: "Trading fees collected from perpetual markets.",
    Revenue: "Protocol revenue after referral payouts.",
    ProtocolRevenue: "Revenue directed to the protocol treasury.",
    SupplySideRevenue: "Fees are distributed to LPs and referrals.",
  },
  breakdownMethodology: {
    Fees: {
      'SoDEX Perps Fees': 'Trading fees collected from perpetual markets',
    },
    Revenue: {
      'SoDEX Perps Fees To Protocol': 'Trading fees collected by protocol.',
    },
    SupplySideRevenue: {
      'SoDEX Perps Fees To LPs': 'Trading fees distributed to LPs.',
    },
  },
};

export default adapter;
