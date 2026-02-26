import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import {
  FetchOptions,
  FetchResult,
  SimpleAdapter,
  IJSON,
} from "../../adapters/types";
import { ethers } from "ethers";
import { addOneToken } from "../../helpers/prices";
import { toInt256, fromUInt, mul } from "./quadHelper";
import { swapEventABI } from "./swapEventABI";

import { cache } from "@defillama/sdk";

const poolCreatedEvent =
  "event PoolCreated(address indexed token0, address indexed token1, int256 splits, address pool, uint8 decimals0, uint8 decimals1)";

const getAbsoluteBigInt = (value: bigint): bigint => {
  return value < BigInt(0) ? value * BigInt(-1) : value;
};

let factory = "0x86342D7bBe93cB640A6c57d4781f04d93a695f08";

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { createBalances, getLogs, chain, api } = fetchOptions;
  factory = factory.toLowerCase();
  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`;
  const iface = new ethers.Interface([poolCreatedEvent]);
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!logs?.length)
    throw new Error("No pairs found, is there TVL adapter for this already?");
  logs = logs.map((log: any) => iface.parseLog(log)?.args);
  const decimals: any = {};
  const pairObject: IJSON<string[]> = {};
  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1];
    decimals[log.pool] = [log.decimals0, log.decimals1];
  });

  const filteredPairs = await filterPools({
    api,
    pairs: pairObject,
    createBalances,
  });
  const dailyVolume = createBalances();

  const swapInterface = new ethers.Interface([swapEventABI]);

  await Promise.all(
    Object.keys(filteredPairs).map(async (pair) => {
      const [token0, token1] = pairObject[pair];
      const event = swapInterface.getEvent("SpotSwapEvent");
      if (!event) {
        throw new Error("Event not found");
      }
      const logs = await getLogs({ target: pair, eventAbi: event });
      logs.forEach((log) => {
        const tenToPowerDecimals0 = fromUInt(
          BigInt(10 ** Number(decimals[pair][0]))
        );
        const tenToPowerDecimals1 = fromUInt(
          BigInt(10 ** Number(decimals[pair][1]))
        );

        const amount0: bigint = toInt256(
          mul(log.swapped.token0, tenToPowerDecimals0)
        );
        const amount1: bigint = toInt256(
          mul(log.swapped.token1, tenToPowerDecimals1)
        );

        addOneToken({
          chain,
          balances: dailyVolume,
          token0,
          token1,
          amount0: getAbsoluteBigInt(amount0).toString(),
          amount1: getAbsoluteBigInt(amount1).toString(),
        });
      });
    })
  );

  return { dailyVolume } as any;
};

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: "2025-01-13",
    }
  },
  methodology: {dailyVolume: "This adapter calculates the daily volume of spot trading by processing the Spot Swap related events emitted by InfinityPools smart contracts"}
};
export default adapters;
