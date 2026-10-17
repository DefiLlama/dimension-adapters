import { Chain } from "../../adapters/types";
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

/**
 * Napier Finance Volume Adapter
 *
 * Tracks swap volume from Napier AMM pools by monitoring on-chain events.
 * Supports both Curve TwoCrypto pools (TokenExchange events) and
 * TokiHook/Uniswap V4 pools (HookSwap events).
 *
 * Pool addresses and types are fetched from napier-api to dynamically
 * detect which pools exist on each chain.
 *
 * Volume is the target-token (yield-bearing token) leg of each swap,
 * converted to the underlying asset with the market resolver's scale()
 * at the end of the period:  assets = targetAmount * scale / 1e18
 * (scale already accounts for the target/asset decimals).
 */

const CURVE_POOL_ABI = {
  tokenExchangeEvent: "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)",
};

const TOKI_HOOK_ABI = {
  hookSwapEvent: "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
};

const ABI = {
  // TokiPoolToken: the TOKI_HOOK market's `pool.address` is this ERC20 LP token,
  // not the hook. HookSwap is emitted by the hook it points to.
  i_hook: "function i_hook() view returns (address)",
  // PrincipalToken -> its resolver; resolver.scale() = target -> asset rate (1e18 based)
  i_resolver: "function i_resolver() view returns (address)",
  scale: "function scale() view returns (uint256)",
};

// Curve TwoCrypto pools hold the target token at index 0 and the PT at index 1.
const CURVE_TARGET_INDEX = 0n;

interface Market {
  chainId?: number;
  createdAtTimestamp: string;
  metadata: { address: string; chainId?: number };
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

async function fetchMarkets(chainId: number, endTimestamp: number): Promise<Market[]> {
  const url = `${API_BASE_URL}/v1/market?chainIds=${chainId}`;
  const res = await axios.get<Market[]>(url);
  if (!Array.isArray(res.data)) {
    throw new Error(`Napier API returned non-array payload for chainId ${chainId}`);
  }
  return res.data.filter((m) =>
    m.pool?.address
    && Number(m.chainId ?? m.metadata?.chainId ?? chainId) === chainId
    && Number(m.createdAtTimestamp) < endTimestamp
  );
}

const fetch = async (options: FetchOptions) => {
  const { api, getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const markets = await fetchMarkets(api.chainId!, options.endTimestamp);
  if (markets.length === 0) return { dailyVolume };

  // target -> asset rate per market, at the end of the period
  const resolvers = await api.multiCall({ abi: ABI.i_resolver, calls: markets.map((m) => m.metadata.address), permitFailure: true });
  const scales = await api.multiCall({ abi: ABI.scale, calls: resolvers.map((r: string | null) => r ?? ADDRESSES.null), permitFailure: true });

  const addTarget = (market: Market, i: number, targetAmount: bigint) => {
    const scale = scales[i];
    if (scale) {
      dailyVolume.add(market.tokens.assetToken.address, targetAmount * BigInt(scale) / 10n ** 18n);
    } else {
      // no resolver answer: count the target token itself (priced by DefiLlama when listed)
      dailyVolume.add(market.tokens.targetToken.address, targetAmount);
    }
  };

  // Curve TwoCrypto pools: TokenExchange per pool
  const curve = markets.map((m, i) => ({ m, i })).filter(({ m }) => m.pool!.poolType === "CURVE_TWO_CRYPTO");
  if (curve.length > 0) {
    const curveEvents = await getLogs({
      targets: curve.map(({ m }) => m.pool!.address),
      eventAbi: CURVE_POOL_ABI.tokenExchangeEvent,
      flatten: false,
    });
    curve.forEach(({ m, i }, k) => {
      for (const event of curveEvents[k] ?? []) {
        let targetAmount: bigint;
        if (BigInt(event.sold_id) === CURVE_TARGET_INDEX) targetAmount = BigInt(event.tokens_sold);
        else if (BigInt(event.bought_id) === CURVE_TARGET_INDEX) targetAmount = BigInt(event.tokens_bought) + BigInt(event.fee); // tokens_bought is net of the fee, which Curve reports in the bought token
        else continue;
        addTarget(m, i, targetAmount);
      }
    });
  }

  // TokiHook (Uniswap V4) pools: HookSwap on each distinct hook, matched by poolId.
  // currency0 of a Toki pool is the target token, so |amount0| is the target leg.
  const toki = markets.map((m, i) => ({ m, i })).filter(({ m }) => m.pool!.poolType === "TOKI_HOOK" && m.pool!.poolId);
  if (toki.length > 0) {
    // no permitFailure: a market whose hook cannot be read must fail the run, not report zero volume
    const hooks: string[] = await api.multiCall({ abi: ABI.i_hook, calls: toki.map(({ m }) => m.pool!.address) });
    const byPoolId = new Map<string, { m: Market; i: number }>();
    toki.forEach((x) => byPoolId.set(x.m.pool!.poolId!.toLowerCase(), x));
    const distinctHooks = [...new Set(hooks.map((h) => h.toLowerCase()))];
    const hookSwapEvents = await getLogs({ targets: distinctHooks, eventAbi: TOKI_HOOK_ABI.hookSwapEvent });
    for (const event of hookSwapEvents) {
      const x = byPoolId.get(String(event.poolId).toLowerCase());
      if (!x) continue;
      const amount0 = BigInt(event.amount0);
      addTarget(x.m, x.i, amount0 < 0n ? -amount0 : amount0);
    }
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Aggregates trading volume from Napier AMM pools by tracking on-chain swap events: TokenExchange on Curve AMM (TwoCrypto) pools and HookSwap on the Napier AMM (TokiHook/Uniswap V4) hook each pool points to. Each swap is counted once, on its yield-bearing token leg, converted to the underlying asset with the market resolver's rate.",
};

const chainConfig: Record<Chain, { start: string, deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { start: "2024-02-28" },
  [CHAIN.BASE]: { start: "2024-02-27" },
  [CHAIN.SONIC]: { start: "2024-03-07", deadFrom: "2026-09-28" }, // napier api no longer serves these chains (same as fees/napier)
  [CHAIN.ARBITRUM]: { start: "2024-03-11" },
  [CHAIN.OPTIMISM]: { start: "2024-03-11", deadFrom: "2026-09-28" },
  [CHAIN.FRAXTAL]: { start: "2024-03-11" },
  [CHAIN.MANTLE]: { start: "2024-03-11", deadFrom: "2026-09-28" },
  [CHAIN.BSC]: { start: "2024-03-11" },
  [CHAIN.POLYGON]: { start: "2024-03-12", deadFrom: "2026-09-28" },
  [CHAIN.AVAX]: { start: "2024-03-12", deadFrom: "2026-09-28" },
  [CHAIN.HYPERLIQUID]: { start: "2024-03-13" },
  [CHAIN.PLUME]: { start: "2024-03-13" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-15" },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
