import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const poolV4Abi = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
const swapAbi = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"

const getAbsoluteBigInt = (value: bigint): bigint => {
    return value < BigInt(0) ? value * BigInt(-1) : value;
};

const config = {
    [CHAIN.UNICHAIN]: {
      poolManager: "0x1f98400000000000000000000000000000000004", 
      uniderpHook: "0xb4960cd4f9147f9e37a7aa9005df7156f61e4444", 
      start: "2025-04-23",
      fromBlock: 14569072
    },
}

const fetch = async ( {createBalances, getLogs, chain }: FetchOptions) => {
    const { poolManager, uniderpHook, fromBlock } = config[chain]

    const dailyVolume = createBalances()

    // Get list pools created by uniderp
    const logs = await getLogs({
        target: poolManager,
        skipIndexer: true,
        eventAbi: poolV4Abi,
        fromBlock
    })
    const poolIds = logs.filter((log: any) => log.hooks.toLowerCase() === uniderpHook).map((log: any) => log.id);
    for (const poolId of poolIds) {
        // Filter all swap events from pools created by uniderp
        const swapLogs = await getLogs({
          target: poolManager,
          skipIndexer: true,
          eventAbi: swapAbi,
          topics: [
            SWAP_TOPIC,
            poolId
          ],
        })
        for (const log of swapLogs) {
            dailyVolume.addGasToken(getAbsoluteBigInt(log.amount0));
        }
    }
    
    return {
        dailyVolume
    }
}

const methodology = {
    UserFees: "User pays 1% fees on each swap.",
    ProtocolRevenue: "Treasury receives 0.5% of each swap. (0.2% from swap + 0.3% from LPs)",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees comes from the user."
  }

const adapter: Adapter = {
    version: 2,
    adapter: Object.keys(config).reduce((acc, chain) => {
        const { start } = config[chain];
        acc[chain] = {
          fetch,
          start: start,
          meta: {
            methodology
          },
        };
        return acc;
    }, {}),
}

export default adapter;
