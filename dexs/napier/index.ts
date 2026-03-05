import { ChainApi } from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Napier Finance Volume Adapter
 *
 * Tracks swap volume from Napier AMM pools by monitoring on-chain events.
 * Supports both Curve TwoCrypto pools (TokenExchange events) and
 * TokiHook/Uniswap V4 pools (HookSwap events).
 *
 * Pool addresses and types are fetched from napier-api to dynamically
 * detect which pools exist on each chain.
 */

const CURVE_POOL_ABI = {
  tokenExchangeEvent: "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)",
};

const TOKI_HOOK_ABI = {
  hookSwapEvent: "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
};

// TokiHook singleton contract addresses per chain
// All HookSwap events are emitted from a single contract per chain
const TOKI_HOOK_ADDRESSES: Record<number, string> = {
  1: "0x0000000000000000000000000000000000000000",     // Ethereum - TODO: populate
  8453: "0x0000000000000000000000000000000000000000",   // Base - TODO: populate
  146: "0x0000000000000000000000000000000000000000",    // Sonic - TODO: populate
  42161: "0xd4234A3D471159E03501fcC2fFD61aAf43FE1888", // Arbitrum
  10: "0x0000000000000000000000000000000000000000",     // Optimism - TODO: populate
  252: "0x0000000000000000000000000000000000000000",    // Fraxtal - TODO: populate
  5000: "0x0000000000000000000000000000000000000000",   // Mantle - TODO: populate
  56: "0x0000000000000000000000000000000000000000",     // BSC - TODO: populate
  137: "0x0000000000000000000000000000000000000000",    // Polygon - TODO: populate
  43114: "0x0000000000000000000000000000000000000000",  // Avalanche - TODO: populate
  999: "0x0000000000000000000000000000000000000000",    // HyperEVM - TODO: populate
};

interface Market {
  chainId: number;
  metadata: { address: string };
  pool: {
    address: string;
    poolId?: string;
    poolType?: "CURVE_TWO_CRYPTO" | "TOKI_HOOK";
  } | null;
  tokens: {
    targetToken: { id: string; decimals: number; address: string };
    assetToken: { id: string; address: string; decimals: number };
  };
}

const API_BASE_URL = process.env.NAPIER_API_URL ?? "https://api-v2.napier.finance";

async function fetchMarkets(api: ChainApi) {
  const url = `${API_BASE_URL}/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<Market[]>(url);

  const curvePools: string[] = [];
  const tokiPools: string[] = [];
  const poolToMarket = new Map<string, Market>();

  for (const market of res.data) {
    if (!market.pool?.address) continue;
    const poolAddress = market.pool.address;
    poolToMarket.set(poolAddress.toLowerCase(), market);

    if (market.pool.poolType === "TOKI_HOOK") {
      tokiPools.push(poolAddress);
    } else {
      curvePools.push(poolAddress);
    }
  }

  return { curvePools, tokiPools, poolToMarket };
}

const fetch = (_chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultVolume> => {
    const { getLogs, api, createBalances } = options;
    const { curvePools, tokiPools, poolToMarket } = await fetchMarkets(api);
    const dailyVolume = createBalances();

    // Track Curve TwoCrypto pool volume via TokenExchange events
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
          const soldId = event.sold_id;
          const boughtId = event.bought_id;
          const tokensSold = event.tokens_sold;
          const tokensBought = event.tokens_bought;

          // Target token is always token index 1 in the Curve pool
          let targetAmount: bigint;
          if (soldId === 1n) {
            targetAmount = tokensSold;
          } else if (boughtId === 1n) {
            targetAmount = tokensBought;
          } else {
            continue;
          }

          // Convert target token amount to asset token terms for pricing
          const assetAmount = targetAmount * BigInt(10 ** assetDecimals) / BigInt(10 ** targetDecimals);
          dailyVolume.add(assetToken, assetAmount);
        }
      }
    }

    // Track TokiHook (Uniswap V4) pool volume via HookSwap events
    if (tokiPools.length > 0) {
      const poolIdToMarket = new Map<string, Market>();
      for (const hookAddress of tokiPools) {
        const market = poolToMarket.get(hookAddress.toLowerCase());
        if (market?.pool?.poolId) {
          poolIdToMarket.set(market.pool.poolId.toLowerCase(), market);
        }
      }

      const tokiHookAddress = TOKI_HOOK_ADDRESSES[options.api.chainId!];

      if (tokiHookAddress && tokiHookAddress !== "0x0000000000000000000000000000000000000000" && poolIdToMarket.size > 0) {
        const hookSwapEvents = await getLogs({
          target: tokiHookAddress,
          eventAbi: TOKI_HOOK_ABI.hookSwapEvent,
        });

        for (const event of hookSwapEvents) {
          const market = poolIdToMarket.get(event.poolId.toLowerCase());
          if (!market) continue;

          const assetToken = market.tokens.assetToken.address;
          const assetDecimals = market.tokens.assetToken.decimals;
          const targetDecimals = market.tokens.targetToken.decimals;
          const absAmount0 = event.amount0 < 0n ? -event.amount0 : event.amount0;
          const assetAmount = absAmount0 * BigInt(10 ** assetDecimals) / BigInt(10 ** targetDecimals);
          dailyVolume.add(assetToken, assetAmount);
        }
      }
    }

    return { dailyVolume, timestamp: options.startOfDay };
  };
};

const methodology = {
  Volume: "Aggregates trading volume from Napier AMM pools (Curve TwoCrypto + TokiHook/Uniswap V4) by tracking on-chain swap events.",
};

const chainConfig: Record<Chain, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2024-02-28" },
  [CHAIN.BASE]: { start: "2024-02-27" },
  [CHAIN.SONIC]: { start: "2024-03-07" },
  [CHAIN.ARBITRUM]: { start: "2024-03-11" },
  [CHAIN.OPTIMISM]: { start: "2024-03-11" },
  [CHAIN.FRAXTAL]: { start: "2024-03-11" },
  [CHAIN.MANTLE]: { start: "2024-03-11" },
  [CHAIN.BSC]: { start: "2024-03-11" },
  [CHAIN.POLYGON]: { start: "2024-03-12" },
  [CHAIN.AVAX]: { start: "2024-03-12" },
  [CHAIN.HYPERLIQUID]: { start: "2024-03-13" },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.entries(chainConfig).map(([chain, config]) => [
        chain,
        { fetch: fetch(chain as Chain), start: config.start },
      ])
    ),
  },
  methodology,
};

export default adapter;
