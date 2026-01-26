import { ChainApi } from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Napier Finance Volume Adapter (On-chain Event-Based)
 *
 * Napier is a fixed-rate yield protocol that allows users to trade principal tokens (PT)
 * and yield tokens (YT) on AMM pools.
 *
 * Data source: On-chain events from Pool contracts
 * Methodology:
 * - Fetches market addresses from Napier API
 * - Tracks TokenExchange events (Curve TwoCrypto pools)
 * - Tracks HookSwap events (TokiHook/Uniswap V4 pools)
 * - Converts token amounts to USD using DefiLlama prices with scale-based conversion
 */

// ABIs for volume-tracking events
const CURVE_POOL_ABI = {
  tokenExchangeEvent: "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)",
};

const TOKI_HOOK_ABI = {
  hookSwapEvent: "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
};

// TokiHook singleton contract addresses by chain
// All HookSwap events are emitted from these contracts, not from individual hook addresses
const TOKI_HOOK_ADDRESSES: Record<number, string> = {
  42161: "0xd4234A3D471159E03501fcC2fFD61aAf43FE1888", // Arbitrum
};

interface Market {
  chainId: number;
  metadata: {
    address: string;
  };
  pool: {
    address: string;
    poolId?: string; // TokiHook: Uniswap V4 PoolKey hash (to filter events by market)
    poolType?: "CURVE_TWO_CRYPTO" | "TOKI_HOOK"; // Pool type (Curve vs TokiHook)
  } | null;
  tokens: {
    targetToken: {
      id: string;
      decimals: number;
      address: string;
    };
    assetToken: {
      id: string;
      address: string;
      decimals: number;
    };
  };
  poolInitialData?: {
    scale: string;
  };
}

async function fetchMarkets(api: ChainApi): Promise<FetchMarketsResult> {
  const url = `https://api-v2.napier.finance/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<Market[]>(url);

  const curvePools: string[] = [];
  const tokiPools: string[] = [];
  const poolToMarket = new Map<string, Market>();

  for (const market of res.data) {
    if (!market.pool?.address) continue;

    const poolAddress = market.pool.address;
    poolToMarket.set(poolAddress.toLowerCase(), market);

    // Use poolType field if available, otherwise default to Curve (production pools)
    const poolType = market.pool.poolType || "CURVE_TWO_CRYPTO";

    if (poolType === "TOKI_HOOK") {
      tokiPools.push(poolAddress);
    } else {
      // Default to Curve for all other cases (CURVE_TWO_CRYPTO or null)
      curvePools.push(poolAddress);
    }
  }

  return { curvePools, tokiPools, poolToMarket };
}

export interface FetchMarketsResult {
  curvePools: string[];
  tokiPools: string[];
  poolToMarket: Map<string, Market>;
}

const fetch = (_chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultVolume> => {
    const { getLogs, api, createBalances } = options;

    const { curvePools, tokiPools, poolToMarket } = await fetchMarkets(api);

    const dailyVolume = createBalances();

    // Track TokenExchange events from Curve pools
    if (curvePools.length > 0) {
      const curveExchangeEvents = await getLogs({
        targets: curvePools,
        eventAbi: CURVE_POOL_ABI.tokenExchangeEvent,
        flatten: false,
      });

      for (let i = 0; i < curvePools.length; i++) {
        const poolAddress = curvePools[i].toLowerCase();
        const market = poolToMarket.get(poolAddress);
        if (!market) continue;

        const events = curveExchangeEvents[i];
        if (!events || events.length === 0) continue;

        const assetToken = market.tokens.assetToken.address;
        const assetDecimals = market.tokens.assetToken.decimals;
        const targetDecimals = market.tokens.targetToken.decimals;

        for (const event of events) {
          // TokenExchange event params: buyer, sold_id, tokens_sold, bought_id, tokens_bought, fee, packed_price_scale
          const soldId = event.sold_id;
          const boughtId = event.bought_id;
          const tokensSold = event.tokens_sold;
          const tokensBought = event.tokens_bought;

          // In Napier pools, id 0 = PT, id 1 = Target
          // We want to track the target token side of the trade
          let targetAmount: bigint;
          if (soldId === 1n) {
            // Selling Target for PT
            targetAmount = tokensSold;
          } else if (boughtId === 1n) {
            // Buying Target with PT
            targetAmount = tokensBought;
          } else {
            continue;
          }

          // Convert target token amount to asset token terms (like Pendle's SY approach)
          // Target token (e.g., yOG-USDC 18 decimals) → Asset token (e.g., USDC 6 decimals)
          // This ensures DefiLlama can price the volume correctly
          const assetAmount = targetAmount * BigInt(10 ** assetDecimals) / BigInt(10 ** targetDecimals);

          // Add volume in asset token terms (for better price resolution)
          dailyVolume.add(assetToken, assetAmount);
        }
      }
    }

    // Track HookSwap events from TokiHook pools
    if (tokiPools.length > 0) {
      // ===================================================================
      // IMPORTANT: TokiHook pools use Uniswap V4 architecture
      // - ONE TokiHook singleton contract emits ALL HookSwap events
      // - Each market is identified by unique poolId (PoolKey hash)
      // - Must filter events by poolId to avoid double-counting
      // ===================================================================

      // Build poolId-to-market mapping
      const poolIdToMarket = new Map<string, Market>();

      for (const hookAddress of tokiPools) {
        const market = poolToMarket.get(hookAddress.toLowerCase());
        if (!market) continue;

        // Map poolId to market (for event filtering)
        if (market.pool?.poolId) {
          poolIdToMarket.set(market.pool.poolId.toLowerCase(), market);
        }
      }

      // Get TokiHook singleton address for this chain
      const tokiHookAddress = TOKI_HOOK_ADDRESSES[options.api.chainId!];

      if (!tokiHookAddress) {
        console.warn(`TokiHook not deployed on chain ${options.api.chainId}, skipping`);
      } else if (poolIdToMarket.size === 0) {
        console.warn(`No TokiHook markets with poolId found, skipping`);
      } else {
        // Fetch ALL HookSwap events from TokiHook singleton contract
        const hookSwapEvents = await getLogs({
          target: tokiHookAddress,
          eventAbi: TOKI_HOOK_ABI.hookSwapEvent,
        });

        // Filter events by poolId and process volume
        for (const event of hookSwapEvents) {
          // Extract poolId from event (indexed parameter)
          const eventPoolId = event.poolId.toLowerCase();

          // Find the market this event belongs to
          const market = poolIdToMarket.get(eventPoolId);

          if (!market) {
            // Event belongs to a market we're not tracking, skip
            continue;
          }

          const assetToken = market.tokens.assetToken.address;
          const assetDecimals = market.tokens.assetToken.decimals;
          const targetDecimals = market.tokens.targetToken.decimals;
          const amount0 = event.amount0;

          // Use absolute value for volume
          const absAmount0 = amount0 < 0n ? -amount0 : amount0;

          // Convert target token amount to asset token terms (like Pendle's SY approach)
          // Target token (e.g., yOG-USDC 18 decimals) → Asset token (e.g., USDC 6 decimals)
          // This ensures DefiLlama can price the volume correctly
          const assetAmount = absAmount0 * BigInt(10 ** assetDecimals) / BigInt(10 ** targetDecimals);

          // Add volume to the CORRECT market (filtered by poolId)
          dailyVolume.add(assetToken, assetAmount);
        }
      }
    }

    return {
      dailyVolume,
      timestamp: options.startOfDay,
    };
  };
};

const methodology = {
  Volume:
    "Aggregates trading volume from Napier AMM pools by tracking TokenExchange events (Curve TwoCrypto pools) and HookSwap events (TokiHook/Uniswap V4 pools). Volume is calculated from the target token side of trades.",
};

const chainConfig: Record<Chain, Config> = {
  [CHAIN.ETHEREUM]: {
    start: "2024-02-28",
  },
  [CHAIN.BASE]: {
    start: "2024-02-27",
  },
  [CHAIN.SONIC]: {
    start: "2024-03-07",
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-03-11",
  },
  [CHAIN.OPTIMISM]: {
    start: "2024-03-11",
  },
  [CHAIN.FRAXTAL]: {
    start: "2024-03-11",
  },
  [CHAIN.MANTLE]: {
    start: "2024-03-11",
  },
  [CHAIN.BSC]: {
    start: "2024-03-11",
  },
  [CHAIN.POLYGON]: {
    start: "2024-03-12",
  },
  [CHAIN.AVAX]: {
    start: "2024-03-12",
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2024-03-13",
  },
};

type Config = {
  start: string;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.entries(chainConfig).map(([chain, config]) => [
        chain,
        {
          fetch: fetch(chain as Chain),
          start: config.start,
        },
      ])
    ),
  },
  methodology,
};

export default adapter;
