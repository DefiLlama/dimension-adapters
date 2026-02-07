import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ember_fees_url="https://vaults.api.sui-prod.bluefin.io/api/v2/vaults/fees"

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const result= await fetchURL(`${ember_fees_url}?startTimestampInMs=${options.startTimestamp*1000}&endTimestampInMs=${options.endTimestamp*1000}`);
  const feesUsdE9=result.feesUsdE9;
  const revenueUsdE9=result.revenueUsdE9;

  const fees = Number(feesUsdE9) / 1e9;
  const revenue = Number(revenueUsdE9) / 1e9;
  
  return {
    dailyFees: fees,
    dailyRevenue: revenue,
    dailyProtocolRevenue: revenue,
    dailySupplySideRevenue: fees - revenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-09-01',
    },
  },
  methodology: {
    Fees: 'Total yields collected from Ember protocol vaults.',
    Revenue: 'Share of yields to Ember protocol.',
    ProtocolRevenue: 'Share of yields to Ember protocol.',
    SupplySideRevenue: 'Share of yields to vaults depositors.',
  }
};

export default adapter;
