import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Napier Finance Fees Adapter (On-Chain)
 *
 * Tracks fees from on-chain events to support historical backfill.
 * Fee sources:
 * - YieldFeeAccrued: PT-level performance/issuance/redemption fees
 * - TokenExchange.fee: Curve TwoCrypto AMM swap fees
 * - HookSwap.hookLPfeeAmount: TokiHook (Uniswap V4) AMM swap fees
 *
 * Pool addresses fetched from napier-api for dynamic market discovery.
 */

const YIELD_FEE_ABI = {
  yieldFeeAccruedEvent:
    "event YieldFeeAccrued(uint256 fee)",
};

const CURVE_POOL_ABI = {
  tokenExchangeEvent:
    "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)",
};

const TOKI_HOOK_ABI = {
  hookSwapEvent:
    "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
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
  fees: {
    splitFeePercentage: string;
  };
  metrics: {
    underlyingRewards: Array<{
      rewardToken: { address: string };
    }>;
  };
}

const API_BASE_URL =
  process.env.NAPIER_API_URL ?? "https://api-v2.napier.finance";

async function fetchMarkets(api: any) {
  const url = `${API_BASE_URL}/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<Market[]>(url);

  if (!Array.isArray(res.data)) {
    throw new Error(
      `Napier API returned non-array payload for chainId ${api.chainId}`
    );
  }

  const principalTokens: string[] = [];
  const ptToMarket = new Map<string, Market>();
  const curvePools: string[] = [];
  const poolToMarket = new Map<string, Market>();
  let tokiHookAddress: string | null = null;
  const poolIdToMarket = new Map<string, Market>();

  for (const market of res.data) {
    // PT addresses for YieldFeeAccrued events
    const ptAddress = market.metadata.address;
    principalTokens.push(ptAddress);
    ptToMarket.set(ptAddress.toLowerCase(), market);

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

  return {
    principalTokens,
    ptToMarket,
    curvePools,
    poolToMarket,
    tokiHookAddress,
    poolIdToMarket,
    markets: res.data,
  };
}

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances, chain } = options;
  const {
    principalTokens,
    ptToMarket,
    curvePools,
    poolToMarket,
    tokiHookAddress,
    poolIdToMarket,
    markets,
  } = await fetchMarkets(options.api);

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  // 1. Track PT yield fees via YieldFeeAccrued events
  if (principalTokens.length > 0) {
    const yieldFeeEvents = await getLogs({
      targets: principalTokens,
      eventAbi: YIELD_FEE_ABI.yieldFeeAccruedEvent,
      flatten: false,
    });

    for (let i = 0; i < principalTokens.length; i++) {
      const ptAddress = principalTokens[i].toLowerCase();
      const market = ptToMarket.get(ptAddress);
      if (!market) continue;

      const events = yieldFeeEvents[i];
      if (!events || events.length === 0) continue;

      const assetToken = market.tokens.assetToken.address;
      const assetDecimals = market.tokens.assetToken.decimals;
      const targetDecimals = market.tokens.targetToken.decimals;
      const splitPct = Number(market.fees.splitFeePercentage) / 100;

      for (const event of events) {
        const fee = event.fee;
        // Fee is in target token terms — convert to asset terms for pricing
        const assetAmount =
          (fee * BigInt(10 ** assetDecimals)) /
          BigInt(10 ** targetDecimals);

        dailyFees.add(assetToken, assetAmount);
        // Curator gets splitFeePercentage, protocol gets the rest
        dailySupplySideRevenue.add(
          assetToken,
          (assetAmount * BigInt(Math.round(splitPct * 10000))) / 10000n
        );
        dailyRevenue.add(
          assetToken,
          (assetAmount * BigInt(Math.round((1 - splitPct) * 10000))) / 10000n
        );
      }
    }
  }

  // 2. Track Curve TwoCrypto swap fees via TokenExchange events
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
        const fee = event.fee;
        // Fee is in the token that was bought — convert to asset terms
        const assetAmount =
          (fee * BigInt(10 ** assetDecimals)) /
          BigInt(10 ** targetDecimals);

        dailyFees.add(assetToken, assetAmount);
        // Curve swap fees go entirely to LPs (supply side)
        dailySupplySideRevenue.add(assetToken, assetAmount);
      }
    }
  }

  // 3. Track TokiHook swap fees via HookSwap events
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

      // hookLPfeeAmount0 = fees in target token (Currency0)
      const feeTarget = event.hookLPfeeAmount0;
      const assetAmount =
        (feeTarget * BigInt(10 ** assetDecimals)) /
        BigInt(10 ** targetDecimals);

      dailyFees.add(assetToken, assetAmount);
      // TokiHook swap fees go to LPs (supply side)
      dailySupplySideRevenue.add(assetToken, assetAmount);
    }
  }

  // 4. Track protocol revenue from reward tokens sent to treasury
  const rewardTokens = [
    ...new Set(
      markets.flatMap((m) =>
        (m.metrics?.underlyingRewards ?? []).map(
          (r: any) => r.rewardToken.address
        )
      )
    ),
  ];
  if (rewardTokens.length > 0) {
    const treasuryRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens,
    });
    dailyRevenue.addBalances(treasuryRevenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  UserFees:
    "Users pay fees on AMM swaps, PT/YT issuance, redemption, and performance (before/after maturity). Fee rates are defined per market by curators.",
  Fees: "Total fees including AMM trading fees (from Curve TwoCrypto and TokiHook swaps) and PT/YT fees (issuance, redemption, performance). Tracked via on-chain events.",
  Revenue:
    "Protocol revenue from the non-curator share of PT yield fees, plus reward tokens sent to treasury.",
  ProtocolRevenue:
    "Protocol/DAO share of yield fees based on the Curator-Protocol fee distribution ratio, plus protocol reward tokens.",
  SupplySideRevenue:
    "Curator's share of yield fees plus all AMM swap fees (which go entirely to LPs).",
};

type Config = {
  treasury: string;
  start: string;
};

const chainConfig: Record<Chain, Config> = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-28",
  },
  [CHAIN.BASE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-27",
  },
  [CHAIN.SONIC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-07",
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.FRAXTAL]: {
    treasury: "0x8C244F488A742365ECB5047E78c29Ac2221ac0bf",
    start: "2024-03-11",
  },
  [CHAIN.MANTLE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.BSC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.POLYGON]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.AVAX]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
  [CHAIN.PLUME]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
