import { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const event_notify_reward = 'event NotifyReward(address indexed from,uint256 amount)';
const event_geuge_created = 'event StakingRewardsCreated(address indexed pool,address indexed rewardToken,address indexed stakingRewards,address creator)'

const abis: any = {
  "forSwaps": "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, int24 type, address token0, address token1, address factory, uint256 pool_fee)[])"
}
const sugars: any = {
  [CHAIN.MODE]: "0x207DfB36A449fd10d9c3bA7d75e76290a0c06731",
  [CHAIN.BOB]: "0x3e71CCdf495d9628D3655A600Bcad3afF2ddea98"
}

const stakingRewards = {
  [CHAIN.MODE]: "0xD2F998a46e4d9Dd57aF1a28EBa8C34E7dD3851D7",
  [CHAIN.BOB]: "0x8Eb6838B4e998DA08aab851F3d42076f21530389"
}
const rewardTokens = {
  [CHAIN.MODE]: "0xDfc7C877a950e49D2610114102175A06C2e3167a",
  [CHAIN.BOB]: "0x4200000000000000000000000000000000000006"
}

export const fees_bribes = async ({ getLogs, createBalances, getToBlock, chain }: FetchOptions): Promise<Balances> => {
  const stakingRewardsFactory = stakingRewards[chain] ;
  const rewardToken = rewardTokens[chain];
  const dailyFees = createBalances()
  const logs_geuge_created = (await getLogs({
    target: stakingRewardsFactory,
    fromBlock: 7797181,
    toBlock: await getToBlock(),
    eventAbi: event_geuge_created,
  }))
  const bribes_contract: string[] = logs_geuge_created.map((e: any) => e.stakingRewards.toLowerCase());
  if (bribes_contract.length === 0) {
    return dailyFees;
  }
  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyFees.add(rewardToken, e.amount)
  })
  return dailyFees;
}

const fetchFees = async (options: FetchOptions): Promise<FetchResultFees> => {
  const chunkSize = 500;
  let currentOffset = 0;
  let unfinished = true;
  const allPools: any[] = [];

  if (options.startOfDay > 1715763701) { // Sugar pools data helper contract created at this timestamp
    while (unfinished) {
      const allPoolsChunk = await options.api.call({ target: sugars[options.chain], abi: abis.forSwaps, params: [chunkSize, currentOffset], chain: options.chain})
      unfinished = allPoolsChunk.length !== 0;
      currentOffset += chunkSize;
      allPools.push(...allPoolsChunk);
    }
  }

  const pools = allPools.map((e: any) => e.lp)
  const res: any = await getDexFees({ chain: options.chain, fromTimestamp: options.fromTimestamp, toTimestamp: options.toTimestamp, pools, timestamp: options.startOfDay, fetchOptions: options })
  res.dailyBribesRevenue = await fees_bribes(options);
  return res;
}

export {
  fetchFees
}
