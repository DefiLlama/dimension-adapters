import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";

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
const event_create_ty = 'event CreateYieldContract(address indexed SY,uint256 indexed expiry,address PT,address YT)';
const event_collect_interest_fees = 'event CollectInterestFee(uint256 amountInterestFee)';
const event_collect_reward_fees = 'event CollectRewardFee(address indexed rewardToken,uint256 amountRewardFee)';
const event_swap = 'event Swap(address indexed caller,address indexed receiver,int256 netPtOut,int256 netSyOut,uint256 netSyFee,uint256 netSyToReserve)'

const topic0_collect_interest_fees = '0x004e8d79e4b41c5fad7561dc7c07786ee4e52292da7a3f5dc7ab90e32cc30423';
const topic0_collect_reward_fees = '0x880a48d40a6133941abdcfabd5c5f9a791b1e6c8afd23138c5a36e3d95039222';
const topic0_swap = '0x829000a5bc6a12d46e30cdcecd7c56b1efd88f6d7d059da6734a04f3764557c4';

const contract_interface = new ethers.utils.Interface([
  event_claim_reward,
  event_create_ty,
  event_collect_interest_fees,
  event_collect_reward_fees,
  event_swap,
]);

interface IContract {
  yt: string;
  sy: string;
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

interface ISY {
  address: string;
}
interface IMarket {
  address: string;
  sy: ISY;
}

type TChainId = {
  [l: string | Chain]: number;
}
const mapChainId: TChainId = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
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

    const logs: ILog[][] = (await Promise.all(contract_address[chain].map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: endblock,
      fromBlock: startblock,
      keys: [],
      chain: chain,
      topics: ['0x2193aa20a3717f5f4ac79482f4f553e5f0afe8f4e6ec3e3d1aa2e138adc4763f']
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output).flat();

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
    const swap_fees = await fetch_swap_fees(chain, timestamp, startblock, endblock);
    const dailyFees = rewardAmount;
    const dailyRevenue = (rewardAmount * 0.03) + swap_fees;
    return {
      dailyFees: `${dailyFees + swap_fees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  }
}


const fetchARB = async (timestamp: number) => {
  try {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const startblock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
    const endblock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
    const factory = '0x28de02ac3c3f5ef427e55c321f73fdc7f192e8e4'

    const log_create_contract: ILog[] = (await sdk.api.util.getLogs({
      target: factory,
      topic: '',
      toBlock: endblock,
      fromBlock: 	62978133,
      keys: [],
      chain: CHAIN.ARBITRUM,
      topics: ['0xaa79d8f17776adeaa316c5411b72e8b0057d064974fa8748f32492ecaa22ecd1']
    })).output as ILog[];
    const yt_contract_address: IContract[] = log_create_contract.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      return {
        yt: value.args.YT,
        sy: value.args.SY
      }
    });
    const yt_contract = yt_contract_address.map((e: IContract) => e.yt);
    const sy_contract = yt_contract_address.map((e: IContract) => e.sy);


    const logs_collect_interest_fees: ILog[] = (await Promise.all(yt_contract.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: endblock,
      fromBlock: startblock,
      keys: [],
      chain: CHAIN.ARBITRUM,
      topics: [topic0_collect_interest_fees]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output).flat();

      const logs_collect_reward_fees: ILog[] = (await Promise.all(yt_contract.map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: endblock,
        fromBlock: startblock,
        keys: [],
        chain: CHAIN.ARBITRUM,
        topics: [topic0_collect_reward_fees]
      }))))
        .map((p: any) => p)
        .map((a: any) => a.output).flat();
    const rewardToken = logs_collect_reward_fees.map((e: ILog) => contract_interface.parseLog(e).args.rewardToken)
    const coins = [...new Set([...rewardToken, ...sy_contract])].map((e: string) => `${CHAIN.ARBITRUM}:${e.toLowerCase()}`)
    const prices = await getPrices(coins, timestamp);
    const fees_interest: number = logs_collect_interest_fees.map((a: ILog) => {
      const value = contract_interface.parseLog(a);
      const yt_contract_index = yt_contract.findIndex((e: string) => e.toLowerCase() === a.address.toLowerCase())
      const address = sy_contract[yt_contract_index];
      const price = prices[`${CHAIN.ARBITRUM}:${address.toLowerCase()}`].price;
      const decimals = prices[`${CHAIN.ARBITRUM}:${address.toLowerCase()}`].decimals;
      return (Number(value.args.amountInterestFee._hex) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a + b,0)

    const fees_reward: number = logs_collect_reward_fees.map((a: ILog) => {
      const value = contract_interface.parseLog(a);
      const price = prices[`${CHAIN.ARBITRUM}:${value.args.rewardToken.toLowerCase()}`].price;
      const decimals = prices[`${CHAIN.ARBITRUM}:${value.args.rewardToken.toLowerCase()}`].decimals;
      return (Number(value.args.amountRewardFee._hex) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a + b,0)

    const swap_fees = await fetch_swap_fees(CHAIN.ARBITRUM, timestamp, startblock, endblock);
    const dailyFees = (fees_interest + fees_reward + swap_fees);
    const dailyRevenue = dailyFees;

    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    console.error(error)
    throw error;
  }
}

const fetch_swap_fees = async (chain: Chain, timestamp: number, startblock: number, endblock: number): Promise<number> => {
  const url = 'https://api-v2.pendle.finance/core/graphql';
  const graphQueryDaily = gql
  `{markets(chainId: ${mapChainId[chain]}, limit: 1000) {
    results {
      address
      sy {
        address
      }
    }
  }}`;
  const markets: IMarket[] = (await request(url, graphQueryDaily)).markets.results;
  const markets_addess = markets.map((e: IMarket) => e.address);
  const coins = markets.map((e: IMarket) =>  `${chain}:${e.sy.address.toLowerCase()}`);
  const prices = await getPrices(coins, timestamp);

  const logs_collect_reward_fees: ILog[] = (await Promise.all(markets_addess.map((address: string) => sdk.api.util.getLogs({
    target: address,
    topic: '',
    toBlock: endblock,
    fromBlock: startblock,
    keys: [],
    chain: chain,
    topics: [topic0_swap]
  }))))
    .map((p: any) => p)
    .map((a: any) => a.output).flat();
  const swap_fees = logs_collect_reward_fees.map((e: ILog) => {
    const value = contract_interface.parseLog(e);
    const market = markets.find(e => e.address.toLowerCase() === e.address.toLowerCase())
    const price = prices[`${chain}:${market?.sy.address.toLowerCase()}`].price;
    const decimals = prices[`${chain}:${market?.sy.address.toLowerCase()}`].decimals;
    return (Number(value.args.netSyToReserve) / 10 ** decimals) * price;
  }).reduce((a: number, b: number) => a+ b, 0)
  return swap_fees;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchARB,
      start: async () => 1686268800,
    },
  }
};

export default adapter;
