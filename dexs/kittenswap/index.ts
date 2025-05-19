import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";

const CONFIG = {
  PoolFactory: "0xDa12F450580A4cc485C3b501BAB7b0B3cbc3B31B",
};

const event_topics = {
  swap: "0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b",
};

const eventAbis = {
  event_pool_created:
    "event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)",
  event_swap:
    "event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)",
  event_gaugeCreated:
    "event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)",
  event_notify_reward:
    "event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)",
  event_claim_rewards:
    "event ClaimRewards(address indexed from, address indexed reward, uint256 amount)",
};

const abis = {
  fees: "function getFee(address pool, bool _stable) external view returns (uint256)",
};

const getVolumeAndFees = async (
  fromBlock: number,
  toBlock: number,
  fetchOptions: FetchOptions
) => {
  const { createBalances, api, chain } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const rawPools = await fetchOptions.getLogs({
    target: CONFIG.PoolFactory,
    fromBlock: 28543,
    eventAbi: eventAbis.event_pool_created,
    onlyArgs: true,
    cacheInCloud: true,
    skipIndexer: true,
  });

  const fees = await api.multiCall({
    abi: abis.fees,
    target: CONFIG.PoolFactory,
    calls: rawPools.map((i) => ({ params: [i.pool, i.stable] })),
  });
  const poolInfoMap = {} as any;
  const kittenswapPoolSet = new Set();
  rawPools.forEach(({ token0, token1, stable, pool }, index) => {
    pool = pool.toLowerCase();
    const fee = fees[index] / 1e4;
    poolInfoMap[pool] = { token0, token1, stable, fee };
    kittenswapPoolSet.add(pool);
  });

  const blockStep = 2000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = [];

  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock);
    ranges.push([startBlock, endBlock]);
    startBlock += blockStep;
  }

  let errorFound = false;

  await PromisePool.withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]: any) => {
      if (errorFound) return;
      try {
        const logs = await fetchOptions.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          topics: [event_topics.swap],
          entireLog: true,
          skipCache: true,
        });
        sdk.log(
          `Kittenswap got logs (${logs.length}) for ${i++}/ ${Math.ceil(
            (toBlock - fromBlock) / blockStep
          )}`
        );
        const iface = new ethers.Interface([eventAbis.event_swap]);

        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase();
          if (!kittenswapPoolSet.has(pool)) return;
          const parsedLog = iface.parseLog(log);
          const { token0, token1, fee } = poolInfoMap[pool];
          const amount0 =
            Number(parsedLog!.args.amount0In) +
            Number(parsedLog!.args.amount0Out);
          const amount1 =
            Number(parsedLog!.args.amount1In) +
            Number(parsedLog!.args.amount1Out);
          const fee0 = amount0 * fee;
          const fee1 = amount1 * fee;
          addOneToken({
            chain,
            balances: dailyVolume,
            token0,
            token1,
            amount0,
            amount1,
          });
          addOneToken({
            chain,
            balances: dailyFees,
            token0,
            token1,
            amount0: fee0,
            amount1: fee1,
          });
        });
      } catch (e) {
        errorFound = e as boolean;
        throw e;
      }
    });

  if (errorFound) throw errorFound;

  return { dailyVolume, dailyFees };
};

const fetch = async (
  _t: any,
  _a: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const { getToBlock, getFromBlock } = options;
  const [toBlock, fromBlock] = await Promise.all([
    getToBlock(),
    getFromBlock(),
  ]);
  const { dailyVolume, dailyFees } = await getVolumeAndFees(
    fromBlock,
    toBlock,
    options
  );
  return { dailyFees, dailyVolume };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-02-18",
    },
  },
};

export default adapters;
