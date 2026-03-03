import { Adapter, FetchOptions } from "../adapters/types";
import { fetchClipperDexs } from "../dexs/clipper";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  const baseResult = await fetchClipperDexs(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Add swap fees from DEX trades
  if (baseResult.dailyFees) {
    dailyFees.addUSDValue(Number(baseResult.dailyFees), METRIC.SWAP_FEES);
  }

  // Protocol revenue portion of swap fees
  if (baseResult.dailyRevenue) {
    dailyRevenue.addUSDValue(Number(baseResult.dailyRevenue), METRIC.PROTOCOL_FEES);
  }

  return {
    dailyVolume: baseResult.dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Clipper collects trading fees on all token swaps executed through its pools and coves",
  Revenue: "Portion of swap fees retained by the Clipper protocol",
  ProtocolRevenue: "All protocol revenue is allocated to the Clipper treasury"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees collected on token swaps across Clipper pools and cove contracts"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Portion of swap fees retained by the Clipper protocol treasury"
  }
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-08-05' },
    [CHAIN.OPTIMISM]: { start: '2022-06-29' },
    [CHAIN.ARBITRUM]: { start: '2023-08-02' },
    [CHAIN.POLYGON]: { start: '2022-04-20' },
    [CHAIN.MOONBEAM]: { start: '2022-08-05' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;