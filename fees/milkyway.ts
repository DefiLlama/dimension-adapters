import { Adapter, FetchV2 } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

interface FeeResponse {
  staking_rewards: number;
  fees: number;
  supply_side_revenue: number;
}


const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, createBalances }) => {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(endTimestamp * 1000);
  const params = {
    from: startDate.toISOString(),
    to: endDate.toISOString(),
    currency: 'tia'
  }
  const response: FeeResponse = await httpGet('https://apis.milkyway.zone/milktia/fees/range', { params });
  const dailyUserFees = createBalances()
  const dailyStakingRewards = createBalances()
  const dailySupplySideRevenue = createBalances()
  dailyUserFees.addCGToken('celestia', response.fees);
  dailyStakingRewards.addCGToken('celestia', response.staking_rewards);
  dailySupplySideRevenue.addCGToken('celestia', response.supply_side_revenue);
  return {
    dailyUserFees,
    dailyFees: dailyStakingRewards,
    dailyRevenue: dailyUserFees,
    dailyProtocolRevenue: dailyUserFees,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  adapter: {
    osmosis: {
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
