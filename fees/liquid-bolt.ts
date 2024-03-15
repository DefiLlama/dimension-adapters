import { CHAIN } from "../helpers/chains";
import { BaseAdapter, Adapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const methodology = {
  UserFees: "20% performance fees on the arbitrage revenue",
  Fees: "The revenue distributed by the arbitrage robots",
  Revenue: "20% performance fees on the arbitrage revenue",
  ProtocolRevenue: "20% performance fees on the arbitrage revenue",
  HoldersRevenue: "No token yet",
  SupplySideRevenue: "80% of arbitrage revenue to Liquidity Providers"
}

let cachedData: any = undefined;

const getData = async () => {
  if (cachedData === undefined) {
    cachedData = (await httpGet('https://stats.liquidbolt.finance/defillama-liquidbolt.json'));
  }
  return cachedData;
}

const fetch = (chain: string) => {

  return async (timestamp: number) => {

    const data = await getData();
    const stats = data.chains.find((item: any) => item.chain === chain);

    return {
      timestamp,
      totalUserFees: stats.total_user_fees,
      dailyUserFees: stats.daily_user_fees,
      totalFees: stats.total_fees,
      dailyFees: stats.daily_fees,
      totalRevenue: stats.total_revenue,
      dailyRevenue: stats.daily_revenue,
      totalProtocolRevenue: stats.total_protocol_revenue,
      dailyProtocolRevenue: stats.daily_protocol_revenue,
      totalHoldersRevenue: stats.total_holders_revenue,
      dailyHoldersRevenue: stats.daily_holders_revenue,
      totalSupplySideRevenue: stats.total_supply_side_revenue,
      dailySupplySideRevenue: stats.daily_supply_side_revenue,
    };
  }
}

const getAdapter = () => {

  const baseAdapter: BaseAdapter = {
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: 1669312800,
      runAtCurrTime: true,
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1675893600,
      runAtCurrTime: true,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1669312800,
      runAtCurrTime: true,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1669312800,
      runAtCurrTime: true,
      meta: {
        methodology
      }
    },
  }
  return baseAdapter;
}


const adapter: Adapter = {
  adapter: getAdapter()
};


export default adapter;
