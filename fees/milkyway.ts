import { Adapter, FetchV2 } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getPrices } from "../utils/prices";

interface FeeResponse {
  staking_rewards: number;
  fees: number;
  supply_side_revenue: number;
}


const fetch: FetchV2 = async ({ startTimestamp, endTimestamp }) => {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(endTimestamp * 1000);
  const params = {
    from: startDate.toISOString(),
    to: endDate.toISOString(),
    currency: 'tia'
  }
  const response: FeeResponse = await httpGet('https://apis.milkyway.zone/milktia/fees/range', { params });
  const prices = await getPrices(['coingecko:celestia'], endTimestamp);
  const price = prices['coingecko:celestia'];

  const dailyUserFees = String(response.fees * price.price);
  const dailyStakingRewards = String(response.staking_rewards * price.price);
  const dailySupplySideRevenue = String(response.supply_side_revenue * price.price);

  return {
    timestamp: startTimestamp,
    dailyUserFees,
    dailyFees: dailyStakingRewards,
    dailyRevenue: dailyUserFees,
    dailyProtocolRevenue: dailyUserFees,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  adapter: {
    celestia: {
      fetch,
      runAtCurrTime: false,
      // 2024-04-30T17:55:14:00Z
      start: 1714499714,
      meta: {
        methodology: {
          UserFees: "MilkyWay takes 10% fee on users staking rewards",
          Fees: "Staking rewards earned by all staked TIA",
          Revenue: "MilkyWay takes 10% fee on users staking rewards",
          ProtocolRevenue: "MilkyWay takes 10% fee on users staking rewards",
          SuplySideRevenue: "Staking rewards earned by milkTIA holders",
        },
      }
    },
  },
  version: 2
};

export default adapter; // yarn test fees milktia
