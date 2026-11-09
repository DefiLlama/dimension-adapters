import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// AVM Trade Reporter (Biatec's own indexer). Endpoint accepts an arbitrary [timestamp, to) window
// (added specifically for this adapter, see https://github.com/scholtz/AVMTradeReporter/pull/19),
// so it can be pulled hourly instead of only as a fixed daily snapshot.
const URL = "https://api.algorand.scan.biatec.io/api/Stats/dex"

interface IAPIResponse {
  volumeUSD: number;
  feesUSD: number;
  feesLPUSD: number;
  feesProtocolUSD: number;
};

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startTimestamp * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();

  const response: IAPIResponse = await fetchURLAutoHandleRateLimit(`${URL}?dex=Biatec&timestamp=${from}&to=${to}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(response.volumeUSD);
  dailyFees.addUSDValue(response.feesUSD, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(response.feesProtocolUSD, "Swap Fees To Protocol");
  dailySupplySideRevenue.addUSDValue(response.feesLPUSD, "Swap Fees To LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fee charged on every trade on Biatec's Algorand pools.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Portion of the swap fee kept by the Biatec protocol.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Portion of the swap fee kept by the Biatec protocol.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "Portion of the swap fee distributed to liquidity providers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ALGORAND],
  start: '2026-01-01',
  pullHourly: true,
  methodology: {
    Volume: "Total USD value of confirmed swaps on Biatec's Algorand pools, from Biatec's own trade indexer (AVM Trade Reporter).",
    Fees: "Total swap fees paid by traders on Biatec's Algorand pools, from Biatec's own trade indexer (AVM Trade Reporter).",
    UserFees: "Total swap fees paid by traders on every swap.",
    Revenue: "Portion of swap fees kept by the Biatec protocol.",
    ProtocolRevenue: "Portion of swap fees kept by the Biatec protocol.",
    SupplySideRevenue: "Portion of swap fees distributed to liquidity providers.",
  },
  breakdownMethodology,
};

export default adapter;
