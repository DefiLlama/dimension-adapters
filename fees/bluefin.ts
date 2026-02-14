import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const url_sui="https://dapi.api.sui-prod.bluefin.io/marketData/fees"

const fetch = async (_timestamp: number, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const result= await fetchURL(url_sui);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('usd-coin', result.last24HoursFees || 0, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Total trading fees collected from perpetual futures trading on Bluefin Exchange",
  Revenue: "All trading fees are retained by the Bluefin protocol",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users on perpetual futures positions including opening, closing, and modifying positions on Bluefin Exchange",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users on perpetual futures positions including opening, closing, and modifying positions on Bluefin Exchange",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
        fetch,
        start: '2023-11-18',
        runAtCurrTime: true,
      },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
