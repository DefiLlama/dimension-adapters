import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const event_notify_reward =
  "event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)";
const event_geuge_created =
  "event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)";

const contract_interface = new ethers.Interface([
  event_notify_reward,
  event_geuge_created,
]);


interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}


const lphelper = "0x11D66FF243715169d6C14865E18fcc30d3557830";
const factory = "0x769d1BcB5FDf30F5a9D19f1ab8A3cF8b60a6e855";

const abis: any = {
  "getLPDetailsPaginated":
    "function getLPDetailsPaginated(uint256 pageNumber, uint256 pageLength, address factory, address account) view returns (((address lp, address factory, string symbol, uint8 decimals, string name, bool stable, uint256 totalSupply), (address token0, uint8 token0Decimals, uint256 reserve0, string token0Name, string token0Symbol), (address token1, uint8 token1Decimals, uint256 reserve1, string token1Name, string token1Symbol), (address gauge, uint256 gaugeTotalSupply, uint256 emissions, address emissionsToken, uint8 emissionsDecimals, string emissionSymbol, bool gaugeAlive), (address feeAddress, address bribeAddress, address factoryAddress, uint256 poolFee, uint256 token0Fees, uint256 token1Fees), (uint256 accountBalance, uint256 accountEarned, uint256 accountStaked, uint256 claimable0, uint256 claimable1))[])",
  "allPoolsLength": "function allPoolsLength() view returns (uint256)",
};

export const fees_bribes = async (
  fetchOptions: FetchOptions
): Promise<any> => {
  let poolsArr: any[] = [];
  const allPoolsLength = Number(
    await sdk.api2.abi.call({
      target: factory,
      abi: abis.allPoolsLength,
      chain: CHAIN.ZETA,
    })
  );
  const itemsPerPage = 15;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  if (allPoolsLength < itemsPerPage) {
    poolsArr = await sdk.api2.abi.call({
      target: lphelper,
      params: [1, allPoolsLength, factory, ZERO_ADDRESS],
      abi: abis.getLPDetailsPaginated,
      chain: CHAIN.ZETA,
    });
  } else {
    const numberOfPages = Math.ceil(allPoolsLength / itemsPerPage);
    for (let i = 0; i < numberOfPages; i++) {
      const pools4page = await sdk.api2.abi.call({
        target: lphelper,
        params: [i + 1, itemsPerPage, factory, ZERO_ADDRESS],
        abi: abis.getLPDetailsPaginated,
        chain: CHAIN.ZETA,
      });
      poolsArr = [...poolsArr, ...pools4page];
    }
  }

  const bribeVotingReward: string[] = poolsArr
    .map((e: any) => {
      return e[4].bribeAddress;
    })
    .filter((e: string) => e !== ZERO_ADDRESS);
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
