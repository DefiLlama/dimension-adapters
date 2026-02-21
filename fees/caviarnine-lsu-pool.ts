import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import fetchURL from "../utils/fetchURL"

interface CaviarNineLSUPool {
  protocol_fees: {
    interval_1d: {
      usd: number;
    }
  }
  lp_revenue: {
    interval_1d: {
      usd: number;
    }
  };
}
const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const response: CaviarNineLSUPool = (await fetchURL("https://api-core.caviarnine.com/v1.0/stats/product/lsupool")).summary;
  const dailyFees = Number(response.protocol_fees.interval_1d.usd) + Number(response.lp_revenue.interval_1d.usd);
  const dailyRevenue = response.protocol_fees.interval_1d.usd;
  const supplySideRevenue = response.lp_revenue.interval_1d.usd;
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: supplySideRevenue,
    timestamp
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: fetchFees,
      start: '2023-11-05',
      runAtCurrTime: true,
    }
  }
}
export default adapters;
