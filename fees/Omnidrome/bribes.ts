import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_geuge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

const topic0_geuge_created = '0xef9f7d1ffff3b249c6b9bf2528499e935f7d96bb6d6ec4e7da504d1d3c6279e1';
const contract_interface = new ethers.Interface([
  event_notify_reward,
  event_geuge_created
]);

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IBribes {
  token: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: number;
}


const lphelper = '0x1f176AABA9c6e2014455E5C199afD15A70f9e34e';

const abis: any = {
  "getLPDetailsPaginated": "function getLPDetailsPaginated(uint256 pageNumber, uint256 pageLength, address factory, address account) view returns (((address lp, address factory, string symbol, uint8 decimals, string name, bool stable, uint256 totalSupply), (address token0, uint8 token0Decimals, uint256 reserve0, string token0Name, string token0Symbol), (address token1, uint8 token1Decimals, uint256 reserve1, string token1Name, string token1Symbol), (address gauge, uint256 gaugeTotalSupply, uint256 emissions, address emissionsToken, uint8 emissionsDecimals, string emissionSymbol, bool gaugeAlive), (address feeAddress, address bribeAddress, address factoryAddress, uint256 poolFee, uint256 token0Fees, uint256 token1Fees), (uint256 accountBalance, uint256 accountEarned, uint256 accountStaked, uint256 claimable0, uint256 claimable1))[])"
}

export const fees_bribes = async (fetchOptions: FetchOptions): Promise<any> => {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const bribeVotingReward: string[] = (await fetchOptions.api.call({
    target: lphelper,
    params: [1, 1000, "0x769d1BcB5FDf30F5a9D19f1ab8A3cF8b60a6e855", '0x0000000000000000000000000000000000000000'],
    abi: abis.getLPDetailsPaginated,
    chain: CHAIN.ZETA,
  })).map((e: any) => {
    return e[4].bribeAddress;
  }).filter((e: string) => e !== ZERO_ADDRESS);
  const bribe_contracct = [...new Set(bribeVotingReward)];
  const logs: ILog[] = await fetchOptions.getLogs({
    targets: bribe_contracct,
    topics: ['0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b']
  })
  const dailyBribesRevenue = fetchOptions.createBalances();
  logs.forEach((e: ILog) => {
    const value = contract_interface.parseLog(e)
    dailyBribesRevenue.add(value!.args.reward, value!.args.amount)
  })
  return {
    dailyBribesRevenue: dailyBribesRevenue
  };
}
