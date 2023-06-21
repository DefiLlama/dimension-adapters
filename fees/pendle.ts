import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { getBlock } from "../helpers/getBlock";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { type } from "os";

const contract: string[] = [
  '0xcbc72d92b2dc8187414f6734718563898740c0bc',
  '0xd393d1ddd6b8811a86d925f5e14014282581bc04',
  '0x35c16314d6ee4753289e5cc15a5c5e1dd4ead345',
  '0x47ba20283be4d72d4afb1862994f4203551539c5',
  '0xc0dd85720e3bc7959890127b5d3af2d29f6c74f4',
  '0x7f531a70a240fba0e40169e56eede1c6b7ef8463',
  '0x677885afde857b70f40741ff8b60f9afba95dd49',
  '0xcb611d0bd02a74c491b75d51d6ea5558f1887da3',
  '0x3025680925349c9c01c0f01cf300ec963832ec64',
  '0xeb83006b0aaddd15ad8afbebe2f4e0937f210673',
  '0xdf7083f2A0F8a191ab5eEAFebE92ED21cD3Dd915',
  '0x8267fdabd1b8C8645138f2dE5B0fe24988DC9820',
];
type IAddress = {
  [s: string | Chain]: string[];
}
const contract_address: IAddress = {
  [CHAIN.ETHEREUM]: contract,
  [CHAIN.ARBITRUM]: [
    '0x2066a650AF4b6895f72E618587Aad5e8120B7790',
    '0xAF699fb0D9F12Bf7B14474aE5c9Bea688888DF73',
    '0x068DEf65B9dbAFf02b4ee54572a9Fa7dFb188EA3',
    '0xc79d8a2AA6d769138E599D4DBC30569c9870a6Ee',
    '0x318EEC91f653cA72fAFB038f9AD792A6bC0d644C',
    '0xdd4C7313Fe4C92e043B9B7dFE433e239BcD05A0D',
    '0x80c12D5b6Cc494632Bf11b03F09436c8B61Cc5Df',
    '0xc0Cf4b266bE5B3229C49590B59E67A09c15b22f4',
  ]
}
const event_claim_reward = 'event ClaimRewards(address indexed user,address[] rewardTokens,uint256[] rewardAmounts)';
const contract_interface = new ethers.utils.Interface([
  event_claim_reward
]);

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IReward {
  rewardTokens0: string;
  rewardTokens1: string;
  rewardAmounts0: number;
  rewardAmounts1: number;
}

const fetch = (chain: Chain) => {
  return  async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const startblock = (await getBlock(fromTimestamp, chain, {}));
    const endblock = (await getBlock(toTimestamp, chain, {}));
    const query = `
      SELECT TOPICS as topics, tx_hash as transactionHash, data from ${chain}.core.fact_event_logs
      WHERE topics[0] = '0x2193aa20a3717f5f4ac79482f4f553e5f0afe8f4e6ec3e3d1aa2e138adc4763f'
      and contract_address IN (${contract_address[chain].map(a => `'${a.toLowerCase()}'`).join(',')})
      and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
    `
    const value: any[] = (await queryFlipside(query));
    const logs: ILog[] = value.map(([topics, transactionHash, data]:any) => {
      return {
        topics,
        transactionHash,
        data
      }
    })
    const raws = logs.map((e: any) => {
      const value = contract_interface.parseLog(e);
      return {
        rewardTokens0: value.args.rewardTokens[0] || '',
        rewardTokens1: value.args.rewardTokens[1] || '',
        rewardAmounts0: Number(value.args.rewardAmounts[0]?._hex || 0),
        rewardAmounts1: Number(value.args.rewardAmounts[1]?._hex || 0),
      }
    })
    const coins = [...new Set([...raws.map(e => e.rewardTokens0), ...raws.map(e => e.rewardTokens0)].filter((e: string) => e).map((e: string) => `${chain}:${e.toLowerCase()}`))]
    const prices = await getPrices(coins, timestamp);
    const rewardAmount = raws.map((e: IReward) => {
      const price0 = prices[`${chain}:${e.rewardTokens0.toLowerCase()}`]?.price || 0;
      const price1 = prices[`${chain}:${e.rewardTokens1.toLowerCase()}`]?.price || 0;
      const decimals0 = prices[`${chain}:${e.rewardTokens0.toLowerCase()}`]?.decimals || 0;
      const decimals1 = prices[`${chain}:${e.rewardTokens1.toLowerCase()}`]?.decimals || 0;
      const amount0 = (Number(e.rewardAmounts0) / 10 ** decimals0) * price0;
      const amount1 = (Number(e.rewardAmounts1) / 10 ** decimals1) * price1;
      return amount0 + amount1;
    }).reduce((a: number, b: number) => a+b, 0);
    const dailyFees = rewardAmount;
    const dailyRevenue = rewardAmount * 0.03;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1686268800,
    },
  }
};

export default adapter;
