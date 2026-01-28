import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";

// Contract Addresses on Arbitrum
const ADDRESSES = {
  GAUGE_WEIGHT: "0xe6D0aeA7cEf79B08B906e0C455C25042b57b23Ed",
  UNISWAP_V3_FACTORY: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
};

// Uniswap V3 pool init code hash for address computation
const POOL_INIT_CODE_HASH =
  "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

// Deployment block on Arbitrum
const DEPLOY_BLOCK = 263751600;

// Event ABIs
const eventAbis = {
  AddGauge: "event AddGauge(address indexed gauge)",
  AssetAdded:
    "event AssetAdded(address indexed rewardsDepot, address indexed asset)",
};

// Contract ABIs
const abis = {
  strategy: "function strategy() external view returns (address)",
  multiRewardsDepot:
    "function multiRewardsDepot() external view returns (address)",
  token0: "function token0() external view returns (address)",
  token1: "function token1() external view returns (address)",
  fee: "function fee() external view returns (uint24)",
};

interface PoolInfo {
  token0: string;
  token1: string;
  fee: number;
}

/**
 * Compute Uniswap V3 pool address from token pair and fee
 */
function computePoolAddress(
  token0: string,
  token1: string,
  fee: number
): string {
  const [tokenA, tokenB] =
    token0.toLowerCase() < token1.toLowerCase()
      ? [token0, token1]
      : [token1, token0];

  const salt = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24"],
      [tokenA, tokenB, fee]
    )
  );

  return ethers
    .getCreate2Address(ADDRESSES.UNISWAP_V3_FACTORY, salt, POOL_INIT_CODE_HASH)
    .toLowerCase();
}

/**
 * Get all gauges from AddGauge events
 */
async function getGauges(fetchOptions: FetchOptions): Promise<string[]> {
  const { getLogs } = fetchOptions;

  const gaugeLogs = await getLogs({
    target: ADDRESSES.GAUGE_WEIGHT,
    eventAbi: eventAbis.AddGauge,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  return gaugeLogs.map((log: any) => log.gauge.toLowerCase());
}

/**
 * Build gauge -> pool mapping via strategy() calls
 */
async function getGaugePoolMapping(
  gauges: string[],
  api: sdk.ChainApi
): Promise<Map<string, string>> {
  const strategies = await api.multiCall({
    abi: abis.strategy,
    calls: gauges,
    permitFailure: true,
  });

  const mapping = new Map<string, string>();
  gauges.forEach((gauge, i) => {
    if (strategies[i]) {
      mapping.set(gauge.toLowerCase(), strategies[i].toLowerCase());
    }
  });

  return mapping;
}

/**
 * Get pool information (token pair and fee)
 */
async function getPoolInfo(
  pools: string[],
  api: sdk.ChainApi
): Promise<Map<string, PoolInfo>> {
  const [token0s, token1s, fees] = await Promise.all([
    api.multiCall({ abi: abis.token0, calls: pools, permitFailure: true }),
    api.multiCall({ abi: abis.token1, calls: pools, permitFailure: true }),
    api.multiCall({ abi: abis.fee, calls: pools, permitFailure: true }),
  ]);

  const poolInfo = new Map<string, PoolInfo>();
  pools.forEach((pool, i) => {
    if (token0s[i] && token1s[i] && fees[i]) {
      poolInfo.set(pool.toLowerCase(), {
        token0: token0s[i],
        token1: token1s[i],
        fee: Number(fees[i]),
      });
    }
  });

  return poolInfo;
}

/**
 * Get fees and bribes
 * - dailyFees: ALL token transfers into depots
 * - dailyBribesRevenue: transfers NOT from the actual Uniswap V3 pool
 */
async function getFeesAndBribes(
  gauges: string[],
  gaugeToPool: Map<string, string>,
  poolInfo: Map<string, PoolInfo>,
  fetchOptions: FetchOptions
): Promise<{ dailyFees: sdk.Balances; dailyBribesRevenue: sdk.Balances }> {
  const { createBalances, getLogs, api } = fetchOptions;
  const dailyFees = createBalances();
  const dailyBribesRevenue = createBalances();

  // Get MultiRewardsDepot for each gauge
  const depots = await api.multiCall({
    abi: abis.multiRewardsDepot,
    calls: gauges,
    permitFailure: true,
  });

  // Build depot -> actual pool mapping and collect valid depots
  const depotToPool = new Map<string, string>();
  const validDepots: string[] = [];

  gauges.forEach((gauge, i) => {
    if (depots[i]) {
      const depot = depots[i].toLowerCase();
      const strategy = gaugeToPool.get(gauge.toLowerCase());
      if (strategy) {
        const info = poolInfo.get(strategy);
        if (info) {
          const pool = computePoolAddress(info.token0, info.token1, info.fee);
          depotToPool.set(depot, pool);
          validDepots.push(depot);
        }
      }
    }
  });

  if (!validDepots.length) {
    return { dailyFees, dailyBribesRevenue };
  }

  // Get all tokens registered with each depot via AssetAdded events
  const assetAddedLogs = await getLogs({
    targets: validDepots,
    eventAbi: eventAbis.AssetAdded,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
    entireLog: true,
  });

  // Build depot -> tokens mapping
  const depotTokens = new Map<string, Set<string>>();
  assetAddedLogs.forEach((log: any) => {
    const depot = log.address?.toLowerCase();
    const token = log.args?.asset?.toLowerCase();
    if (depot && token) {
      if (!depotTokens.has(depot)) {
        depotTokens.set(depot, new Set());
      }
      depotTokens.get(depot)!.add(token);
    }
  });

  // Fetch Transfer logs for each depot's tokens and process into both balances
  for (const [depot, tokens] of depotTokens.entries()) {
    const pool = depotToPool.get(depot);
    const tokenArray = Array.from(tokens);
    const toAddressFilter = ethers.zeroPadValue(depot, 32);

    // Fetch Transfer logs to this depot in one cycle - same pattern as addTokensReceived
    const transferLogs = await getLogs({
      targets: tokenArray,
      flatten: false,
      eventAbi: "event Transfer (address indexed from, address indexed to, uint256 value)",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null as any,
        toAddressFilter as any,
      ],
    });

    // Process logs - transferLogs grouped by token
    transferLogs.forEach((logs: any[], index: number) => {
      const token = tokenArray[index];
      logs.forEach((log: any) => {
        const from = log.from?.toLowerCase();
        const value = log.value;

        if (!value) return;

        // Add to dailyFees
        dailyFees.add(token, value);

        // Add to dailyBribesRevenue only if not from the actual pool
        if (from !== pool) {
          dailyBribesRevenue.add(token, value);
        }
      });
    });
  }

  return { dailyFees, dailyBribesRevenue };
}

/**
 * Main fetch function
 */
const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
  const { createBalances, api } = fetchOptions;

  // Step 1: Get all gauges
  const gauges = await getGauges(fetchOptions);

  if (!gauges.length) {
    return {
      dailyFees: createBalances(),
      dailyUserFees: createBalances(),
      dailyRevenue: createBalances(),
      dailyHoldersRevenue: createBalances(),
      dailySupplySideRevenue: createBalances(),
      dailyBribesRevenue: createBalances(),
    };
  }

  // Step 2: Build gauge -> pool mapping and get pool info
  const gaugeToPool = await getGaugePoolMapping(gauges, api);
  const pools = Array.from(new Set(gaugeToPool.values()));
  const poolInfo = await getPoolInfo(pools, api);

  // Step 3: Get fees and bribes
  const { dailyFees, dailyBribesRevenue } = await getFeesAndBribes(
    gauges,
    gaugeToPool,
    poolInfo,
    fetchOptions
  );

  // Derived metrics
  const dailyUserFees = dailyFees.clone();
  const dailyHoldersRevenue = dailyFees.clone();

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyBribesRevenue,
  };
};

const methodology = {
  Fees: "All token transfers into MultiRewardsDepot contracts originating from pools and bribes",
  UserFees: "100% of fees",
  Revenue: "100% of fees distributed to governance token holders are revenue.",
  ProtocolRevenue: "0 - Protocol earns via HERMES emissions DAO share",
  HoldersRevenue: "100% of fees distributed to governance token holders",
  SupplySideRevenue: "0 - LPs earn via HERMES emissions",
  BribesRevenue: "Token transfers into MultiRewardsDepot contracts as voting incentives (excluding fee distributions from pools)",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-10-14",
    },
  },
  methodology,
};

export default adapter;
