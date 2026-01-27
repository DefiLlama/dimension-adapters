import { CHAIN } from "../helpers/chains";
import { BaseAdapter, Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

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
    cachedData = (await fetchURL('https://stats.liquidbolt.finance/defillama-liquidbolt.json'));
  }
  return cachedData;
}

const fetch = async (_a: number, _b: any, options: FetchOptions) => {

  const data = await getData();
  const stats = data.chains.find((item: any) => item.chain === options.chain);

  return {
    dailyUserFees: stats.daily_user_fees,
    dailyFees: stats.daily_fees,
    dailyRevenue: stats.daily_revenue,
    dailyProtocolRevenue: stats.daily_protocol_revenue,
    dailyHoldersRevenue: stats.daily_holders_revenue,
    dailySupplySideRevenue: stats.daily_supply_side_revenue,
  };
}

const adapter: Adapter = {
  methodology,
  fetch,
  chains: [CHAIN.FANTOM, CHAIN.ARBITRUM, CHAIN.BSC],
};


export default adapter;
