import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  // If endpoint fails, httpGet will throw and the adapter will fail (desired behavior)
  const response = await httpGet("https://api.hiro.so/v2/info/network_stats");

  return {
    timestamp: options.startOfDay,
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      start: "2025-01-01",
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Total fees paid by users on Stacks blockchain",
    Revenue: "Fees collected by the Stacks network",
  },
};

export default adapter;
