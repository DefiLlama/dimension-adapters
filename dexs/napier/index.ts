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

async function fetchMarkets(api: any) {
  const url = `${API_BASE_URL}/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<Market[]>(url);


  if (!Array.isArray(res.data)) {
    throw new Error(`Napier API returned non-array payload for chainId ${api.chainId}`);
  }

  const curvePools: string[] = [];
  const poolToMarket = new Map<string, Market>();
  let tokiHookAddress: string | null = null;
  const poolIdToMarket = new Map<string, Market>();

  for (const market of res.data) {
    if (!market.pool?.address) continue;
    const poolAddress = market.pool.address;
    poolToMarket.set(poolAddress.toLowerCase(), market);

    if (market.pool.poolType === "TOKI_HOOK" && market.pool.poolId) {
      tokiHookAddress = poolAddress;
      poolIdToMarket.set(market.pool.poolId.toLowerCase(), market);
    } else if (market.pool.poolType === "CURVE_TWO_CRYPTO") {
      curvePools.push(poolAddress);
    }
  }

  return { curvePools, tokiHookAddress, poolIdToMarket, poolToMarket };
}

const fetch = async (options: FetchOptions) => {
    const { getLogs, createBalances } = options;
    const { curvePools, tokiHookAddress, poolIdToMarket, poolToMarket } = await fetchMarkets(options.api);
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
    // tokiHookAddress is the singleton contract derived from the API response (pool.address for TOKI_HOOK markets)
    if (tokiHookAddress && poolIdToMarket.size > 0) {
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

    return { dailyVolume };
  };

const methodology = {
  Volume: "Aggregates trading volume from Napier AMM pools by tracking on-chain swap events. Supports Curve AMM (TwoCrypto) pools via TokenExchange events and Napier AMM (TokiHook/Uniswap V4) pools via HookSwap events.",
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
  [CHAIN.PLUME]: { start: "2024-03-13" },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
