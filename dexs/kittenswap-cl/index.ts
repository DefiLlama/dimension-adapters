import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";

const CONFIG = {
  factory: "0x2E08F5Ff603E4343864B14599CAeDb19918BDCaF",
};

const eventAbis = {
  event_poolCreated:
    "event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)",
  event_swap:
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  event_gaugeCreated:
    "event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)",
  event_notify_reward:
    "event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)",
  event_claim_rewards:
    "event ClaimRewards(address indexed from, address indexed reward, uint256 amount)",
};

const abis = {
  fee: "uint256:fee",
};

const fetch = async (_: any, _1: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const rawPools = await options.getLogs({
    target: CONFIG.factory,
    fromBlock: 2033100,
    eventAbi: eventAbis.event_poolCreated,
    skipIndexer: true,
  });
  const _pools = rawPools.map((i: any) => i.pool.toLowerCase());
  const fees = await options.api.multiCall({ abi: abis.fee, calls: _pools });
  const kittenswapPoolSet = new Set();
  const poolInfoMap = {} as any;
  rawPools.forEach(({ token0, token1, pool }, index) => {
    pool = pool.toLowerCase();
    const fee = fees[index] / 1e6;
    poolInfoMap[pool] = { token0, token1, fee };
    kittenswapPoolSet.add(pool);
  });
  const [toBlock, fromBlock] = await Promise.all([options.getToBlock(), options.getFromBlock()])

  const blockStep = 1000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = [];
  const iface = new ethers.Interface([eventAbis.event_swap]);

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
        const logs = await options.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          entireLog: true,
          skipCache: true,
        });
        sdk.log(
          `Kittenswap slipstream got logs (${
            logs.length
          }) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`
        );
        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase();
          if (!kittenswapPoolSet.has(pool)) return;
          const { token0, token1, fee } = poolInfoMap[pool];
          const parsedLog = iface.parseLog(log);
          const amount0 = Number(parsedLog!.args.amount0);
          const amount1 = Number(parsedLog!.args.amount1);
          const fee0 = amount0 * fee;
          const fee1 = amount1 * fee;
          addOneToken({
            chain: options.chain,
            balances: dailyVolume,
            token0,
            token1,
            amount0,
            amount1,
          });
          addOneToken({
            chain: options.chain,
            balances: dailyFees,
            token0,
            token1,
            amount0: fee0,
            amount1: fee1,
          });
        });
      } catch (e) {
        console.log("Error", e);
        errorFound = e as boolean;
        throw e;
      }
    });

  if (errorFound) throw errorFound;

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch as any,
      start: "2025-04-04",
    },
  },
};
export default adapters;
