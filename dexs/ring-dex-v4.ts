import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getPositionedLogArgs } from "../helpers/logs";
import { isCoreAsset } from "../helpers/prices";
import { formatAddress } from "../utils/utils";

const SWAP_FEES = "Ring V4 Swap Fees";
const SWAP_FEES_TO_LPS = "Ring V4 Swap Fees To LPs";
// Uniswap v4 fees are denominated in hundredths of a basis point:
// https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol
const FEE_DENOMINATOR = 1_000_000n;
const BYTES25_HEX_LENGTH = 2 + 25 * 2;
const FEW_FACTORY_DEPLOYED_AT = 1772012315; // 2026-02-25 factory creation: https://etherscan.io/tx/0x44f323d47962e22c743176bddcbbeb8eff758fadbf2dd0843c2c43e76f3eaf54

// Official Ethereum deployments:
// https://docs.ring.exchange/contracts/v2/deployments
const FEW_FACTORY = "0x7D86394139bf1122E82FDF45Bb4e3b038A4464DD";
// https://docs.uniswap.org/contracts/v4/deployments
const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90";
const POSITION_MANAGER = "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";
const LEGACY_POOLS_ENDPOINT = "https://api-explore-ring-production.up.railway.app";

const swapEvent = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const poolKeysAbi = "function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";

// Preserve the source used by the existing adapter before the current Few
// Factory deployment so historical refills do not lose previously tracked data.
const poolsQuery = gql`
  query ringV4Pools($limit: Int!, $offset: Int!) {
    v4Pools(limit: $limit, offset: $offset) {
      totalCount
      items {
        poolId
        token0 {
          address
          originToken {
            address
          }
        }
        token1 {
          address
          originToken {
            address
          }
        }
      }
    }
  }
`;

const poolsCache: Record<string, Promise<Record<string, string[]>> | undefined> = {};

async function getPools(endpoint: string) {
  return poolsCache[endpoint] ??= (async () => {
    const pools: Record<string, string[]> = {}, limit = 100;

    for (let offset = 0; ; offset += limit) {
      const { v4Pools: { items, totalCount } }: any = await request(endpoint, poolsQuery, { limit, offset });

      items.forEach(({ poolId, token0, token1 }: any) => {
        pools[poolId.toLowerCase()] = [token0, token1].map(t => (t.originToken?.address || t.address).toLowerCase());
      })

      if (offset + items.length >= totalCount || items.length < limit) return pools;
    }
  })();
}

async function fetchLegacy(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const pools = await getPools(LEGACY_POOLS_ENDPOINT);

  const events = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: swapEvent,
  });

  events.forEach((event: any) => {
    const pool = pools[String(event.id).toLowerCase()];
    if (!pool) return;

    const pricedSide = isCoreAsset(options.chain, pool[0]) ? 0 : 1;
    const token = pool[pricedSide];
    const rawAmount = BigInt(pricedSide === 0 ? event.amount0 : event.amount1);
    const amount = rawAmount < 0n ? -rawAmount : rawAmount;
    const fees = amount * BigInt(event.fee) / FEE_DENOMINATOR;

    dailyVolume.add(token, amount);
    dailyFees.add(token, fees, SWAP_FEES);
    dailySupplySideRevenue.add(token, fees, SWAP_FEES_TO_LPS);

  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
}

const abs = (amount: bigint) => amount < 0n ? -amount : amount;

const prefetch: any = async (options: FetchOptions) => {
  if (options.endTimestamp <= FEW_FACTORY_DEPLOYED_AT) return {};
  const wrappedTokenCount = await options.api.call({ target: FEW_FACTORY, abi: "uint256:allWrappedTokensLength" });
  const fewTokens = await options.api.multiCall({
    target: FEW_FACTORY,
    abi: "function allWrappedTokens(uint256) view returns (address)",
    calls: Array.from({ length: Number(wrappedTokenCount) }, (_, i) => ({ params: [i] })),
  });
  const canonicalFewTokens = new Set(fewTokens.map(formatAddress));

  // Discover every pool active in this prefetched window, then verify both
  // currencies against the official Few Factory. No maintained pool list or
  // protocol API is used for the current deployment.
  const swapLogs: Array<any> = await options.getLogs({ target: POOL_MANAGER, eventAbi: swapEvent });
  const poolIds = [...new Set(swapLogs.map(log => String(log.id).toLowerCase()))];
  const poolKeys = await options.api.multiCall({
    abi: poolKeysAbi,
    calls: poolIds.map(poolId => ({ target: POSITION_MANAGER, params: [poolId.slice(0, BYTES25_HEX_LENGTH)] })),
  });
  const pools: Record<string, { currency0: string, currency1: string }> = {};
  poolIds.forEach((poolId, i) => {
    const currency0 = formatAddress(poolKeys[i].currency0);
    const currency1 = formatAddress(poolKeys[i].currency1);
    if (canonicalFewTokens.has(currency0) && canonicalFewTokens.has(currency1))
      pools[poolId] = { currency0, currency1 };
  });

  const poolCurrencies = [...new Set(Object.values(pools).flatMap(pool => [pool.currency0, pool.currency1]))];
  const underlyingTokens = await options.api.multiCall({ abi: "address:token", calls: poolCurrencies });
  const underlyingByFewToken: Record<string, string> = {};
  poolCurrencies.forEach((token, i) => underlyingByFewToken[token] = underlyingTokens[i]);
  return { pools, underlyingByFewToken };
}

async function fetch(options: FetchOptions) {
  if (options.endTimestamp <= FEW_FACTORY_DEPLOYED_AT) return fetchLegacy(options);
  const { pools, underlyingByFewToken } = options.preFetchedResults ?? {};
  if (!pools || !underlyingByFewToken) throw new Error("Ring v4 pool prefetch results are missing");

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const crossesFactoryDeployment = options.startTimestamp < FEW_FACTORY_DEPLOYED_AT;
  const events = crossesFactoryDeployment
    ? await getPositionedLogArgs(options, { target: POOL_MANAGER, eventAbi: swapEvent })
    : await options.getLogs({ target: POOL_MANAGER, eventAbi: swapEvent });
  const legacyPools = crossesFactoryDeployment ? await getPools(LEGACY_POOLS_ENDPOINT) : undefined;
  const factoryDeploymentBlock = crossesFactoryDeployment
    ? await getBlock(FEW_FACTORY_DEPLOYED_AT, options.chain)
    : undefined;
  if (crossesFactoryDeployment && !factoryDeploymentBlock)
    throw new Error("Unable to resolve the Ring Few Factory deployment block");

  for (const event of events) {
    if (crossesFactoryDeployment && event.blockNumber < factoryDeploymentBlock!) {
      const legacyPool = legacyPools![String(event.id).toLowerCase()];
      if (!legacyPool) continue;
      const pricedSide = isCoreAsset(options.chain, legacyPool[0]) ? 0 : 1;
      const token = legacyPool[pricedSide];
      const amount = abs(BigInt(pricedSide === 0 ? event.amount0 : event.amount1));
      const feeAmount = amount * BigInt(event.fee) / FEE_DENOMINATOR;
      dailyVolume.add(token, amount);
      dailyFees.add(token, feeAmount, SWAP_FEES);
      dailySupplySideRevenue.add(token, feeAmount, SWAP_FEES_TO_LPS);
      continue;
    }

    const pool = pools[String(event.id).toLowerCase()];
    if (!pool) continue;

    const underlying0 = underlyingByFewToken[pool.currency0];
    const underlying1 = underlyingByFewToken[pool.currency1];
    const amount0 = BigInt(event.amount0.toString());
    const amount1 = BigInt(event.amount1.toString());
    const token0IsInput = amount0 < 0n;
    const token1IsInput = amount1 < 0n;
    if (token0IsInput === token1IsInput)
      throw new Error(`Ring v4 swap has invalid deltas for pool ${event.id}: amount0=${amount0}, amount1=${amount1}`);

    // Price volume on the core-asset side where possible. The negative pool
    // balance delta is the input currency paid by the trader.
    const useToken0 = isCoreAsset(options.chain, underlying0) || !isCoreAsset(options.chain, underlying1);
    const volumeToken = useToken0 ? underlying0 : underlying1;
    const volumeAmount = abs(useToken0 ? amount0 : amount1);
    const feeToken = token0IsInput ? underlying0 : underlying1;
    const inputAmount = abs(token0IsInput ? amount0 : amount1);
    const feePips = BigInt(event.fee.toString());
    // Uniswap v4 rounds swap fees up. A multi-tick swap can differ by a few raw
    // units because the core contract rounds once per step, not once per event.
    const feeAmount = (inputAmount * feePips + FEE_DENOMINATOR - 1n) / FEE_DENOMINATOR;

    dailyVolume.add(volumeToken, volumeAmount);
    dailyFees.add(feeToken, feeAmount, SWAP_FEES);
    // Ring keeps no portion, so the full fee is supply-side revenue.
    dailySupplySideRevenue.add(feeToken, feeAmount, SWAP_FEES_TO_LPS);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
}
const methodology = {
  Volume: "Volume is calculated from ring pool swap logs.",
  Fees: "Fees are calculated from swap logs using each swap's fee tier.",
  UserFees: "Users pay swap fees on each trade.",
  Revenue: "Ring does not currently take protocol revenue from these v4 pools.",
  SupplySideRevenue: "All swap fees are treated as liquidity provider revenue.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Swap fees paid by users on Ring v4 pools.",
  },
  UserFees: {
    [SWAP_FEES]: "Swap fees paid by users on Ring v4 pools.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS]: "Swap fees distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // These pools are also included in the canonical Uniswap v4 adapter.
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2025-02-01" },
  },
  prefetch,
};

export default adapter;
