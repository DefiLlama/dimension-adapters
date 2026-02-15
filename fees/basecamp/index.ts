import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import { METRIC } from "../../helpers/metrics";

const fetch: any = async (options: FetchOptions) => {
  const tokenReceived = await addTokensReceived({ options, tokens: [ADDRESSES.optimism.WETH_1], targets: ["0xbcb4a982d3c2786e69a0fdc0f0c4f2db1a04e875"] })

  const dailyFees = options.createBalances();
  dailyFees.add(tokenReceived, METRIC.TRADING_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees paid by users for trading and launching tokens on the platform',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'All trading and launching fees are retained by the protocol',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'All revenue goes to the protocol treasury',
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
    },
  },
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
  breakdownMethodology,
};

export default adapter;
