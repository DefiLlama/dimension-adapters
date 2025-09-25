import { Adapter, FetchV2 } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

interface FeeResponse {
  generated_staking_rewards: number;
  fees_collected: number;
  users_gained_staking_rewards: number;
}


const fetch: FetchV2 = async ({ startTimestamp, endTimestamp, createBalances }) => {
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(endTimestamp * 1000);
  const params = {
    from: startDate.toISOString(),
    to: endDate.toISOString(),
  }
  const response: FeeResponse = await httpGet('https://apis.milkyway.zone/v2/protocols/osmosis.milkTIA/rewards', { params });
  const dailyUserFees = createBalances()
  const dailyStakingRewards = createBalances()
  const dailySupplySideRevenue = createBalances()
  dailyUserFees.addCGToken('celestia', response.fees_collected);
  dailyStakingRewards.addCGToken('celestia', response.generated_staking_rewards);
  dailySupplySideRevenue.addCGToken('celestia', response.users_gained_staking_rewards);
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
      // 2024-04-30T17:55:14:00Z
      start: '2024-04-30',
    },
  },
  version: 2,
  methodology: {
    UserFees: "MilkyWay takes 10% fee on users staking rewards",
    Fees: "Staking rewards earned by all staked TIA",
    Revenue: "MilkyWay takes 10% fee on users staking rewards",
    ProtocolRevenue: "MilkyWay takes 10% fee on users staking rewards",
    SuplySideRevenue: "Staking rewards earned by milkTIA holders",
  },
};

export default adapter; // yarn test fees milkyway
