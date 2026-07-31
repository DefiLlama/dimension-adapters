import { cache } from "@defillama/sdk";
import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const FACTORY_ADDRESS = '0xaa2cd7477c451e703f3b9ba5663334914763edf8';
const OLD_FACTORY_DEPLOYMENT_BLOCK = 90593047;
const FIRST_VOLUME_ONLY_DAY_TIMESTAMP = 1783987200; // 2026-07-14T00:00:00Z
const POOL_CREATED_EVENT = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const SWAP_EVENT = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
}

const adapter: Adapter = {
  version: 2,
  pullHourly: false,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        if (options.startOfDay < FIRST_VOLUME_ONLY_DAY_TIMESTAMP)
          throw new Error('Historical RAMSES V2 metrics included retired-source dimensions and cannot be safely recomputed.');

        const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
        if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock < 0 || toBlock < fromBlock)
          throw new Error(`Invalid RAMSES V2 block range: ${fromBlock}-${toBlock}.`);

        const dailyVolume = options.createBalances();
        if (fromBlock === toBlock)
          return { dailyVolume };

        const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${FACTORY_ADDRESS}.json`;
        const cacheResult = await cache.readCache(cacheKey, { readFromR2Cache: true });
        if (!cacheResult || !Array.isArray(cacheResult.logs) || !Number.isSafeInteger(cacheResult.fromBlock) || cacheResult.fromBlock < 0 ||
          !Number.isSafeInteger(cacheResult.toBlock) || cacheResult.toBlock < cacheResult.fromBlock || cacheResult.fromBlock > OLD_FACTORY_DEPLOYMENT_BLOCK)
          throw new Error('Invalid RAMSES V2 factory cache response.');

        const cacheFromBlock = cacheResult.fromBlock;
        const cacheToBlock = cacheResult.toBlock;
        const factoryLogs = [...cacheResult.logs];
        const validateBlockNumber = (log: any, minBlock: number, maxBlock: number) => {
          const blockNumber = Number(log?.blockNumber);
          if (!Number.isSafeInteger(blockNumber) || blockNumber < minBlock || blockNumber > maxBlock)
            throw new Error('Invalid RAMSES V2 PoolCreated log block number.');
          return blockNumber;
        };

        cacheResult.logs.forEach((log: any) => {
          validateBlockNumber(log, cacheFromBlock, cacheToBlock);
          if (typeof log?.address !== 'string' || log.address.toLowerCase() !== FACTORY_ADDRESS)
            throw new Error('Invalid RAMSES V2 PoolCreated log emitter.');
        });
        if (cacheToBlock < toBlock) {
          const missingFromBlock = Math.max(cacheToBlock + 1, OLD_FACTORY_DEPLOYMENT_BLOCK);
          const missingLogs = await options.getLogs({
            target: FACTORY_ADDRESS,
            eventAbi: POOL_CREATED_EVENT,
            entireLog: true,
            fromBlock: missingFromBlock,
            toBlock,
          });
          if (!Array.isArray(missingLogs))
            throw new Error('Invalid RAMSES V2 factory log response.');
          missingLogs.forEach((log: any) => validateBlockNumber(log, missingFromBlock, toBlock));
          factoryLogs.push(...missingLogs);
        }

        const iface = new ethers.Interface([POOL_CREATED_EVENT]);
        const pools = new Map<string, [string, string]>();

        factoryLogs
          .filter((log: any) => Number(log.blockNumber) <= toBlock)
          .forEach((log: any) => {
            let parsedLog;
            try {
              parsedLog = iface.parseLog(log);
            } catch {
              throw new Error('Invalid RAMSES V2 PoolCreated log.');
            }
            if (!parsedLog)
              throw new Error('Invalid RAMSES V2 PoolCreated log.');

            const addresses = [parsedLog.args.pool, parsedLog.args.token0, parsedLog.args.token1];
            if (addresses.some((address: any) => !ethers.isAddress(address) || address === ethers.ZeroAddress))
              throw new Error('Invalid address in RAMSES V2 PoolCreated log.');

            const [pool, token0, token1] = addresses.map((address: string) => address.toLowerCase());
            const existingTokens = pools.get(pool);
            if (existingTokens && (existingTokens[0] !== token0 || existingTokens[1] !== token1))
              throw new Error(`Conflicting RAMSES V2 token metadata for pool ${pool}.`);
            pools.set(pool, [token0, token1]);
          });

        if (!pools.size)
          throw new Error('No RAMSES V2 pools found in factory logs.');

        const poolAddresses = [...pools.keys()];
        const swapLogs = await options.getLogs({
          targets: poolAddresses,
          eventAbi: SWAP_EVENT,
          flatten: false,
          fromBlock: fromBlock + 1,
          toBlock,
        });
        if (!Array.isArray(swapLogs) || swapLogs.length !== poolAddresses.length || swapLogs.some((poolLogs: any) => !Array.isArray(poolLogs)))
          throw new Error('Invalid RAMSES V2 swap log response.');

        swapLogs.forEach((poolLogs: any[], index: number) => {
          const [token0, token1] = pools.get(poolAddresses[index])!;
          poolLogs.forEach((log: any) => {
            addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
          });
        });

        return { dailyVolume };
      },
      start: startTimeV2[CHAIN.ARBITRUM],
    },
  },
};

export default adapter;
