import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IConfig {
  poolManager: string;
  source: "LOGS";
  start: string;
  yieldHarvestingHook?: string; // address of yield harvesting hooks, if any
  yieldHarvestingHookDeploymentBlock?: number;
  blacklistPoolIds?: Array<string>;
}

interface IPool {
  poolId: string;
  currency0: string;
  currency1: string;
  underlyingVault0?: string;
  underlyingVault1?: string;
  underlyingToken0?: string;
  underlyingToken1?: string;
}

const SwapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const InitializeEvent =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const DonateEvent =
  "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)";

const Configs: Record<string, IConfig> = {
  [CHAIN.UNICHAIN]: {
    poolManager: "0x1f98400000000000000000000000000000000004",
    source: "LOGS",
    start: "2025-09-08",
    yieldHarvestingHook: "0x777ef319C338C6ffE32A2283F603db603E8F2A80",
    yieldHarvestingHookDeploymentBlock: 26145483,
  },
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const config = Configs[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  if (config.source === "LOGS") {
    // First, get all Initialize events to build the pools mapping
    const initializeEvents = await sdk.getEventLogs({
      chain: options.chain,
      target: config.poolManager,
      eventAbi: InitializeEvent,
      fromBlock: config.yieldHarvestingHookDeploymentBlock, // We only care about pools created after the deployment of yield harvesting hook
      toBlock: Number(options.toApi.block),
      onlyArgs: true,
    });

    const poolsWithYieldHarvestingHook: { [key: string]: IPool } = {};

    // Build pools mapping from Initialize events
    for (const event of initializeEvents) {
      const poolId = String(event.id);

      if (config.blacklistPoolIds && config.blacklistPoolIds.includes(poolId)) {
        // ignore blacklist pools
        continue;
      }

      // Check if this pool uses yield harvesting hook
      if (
        config.yieldHarvestingHook &&
        String(event.hooks).toLowerCase() ===
          config.yieldHarvestingHook.toLowerCase()
      ) {
        poolsWithYieldHarvestingHook[poolId] = {
          poolId: poolId,
          currency0: String(event.currency0),
          currency1: String(event.currency1),
        };

        //call .asset method on currency0 and currency1 to get underlying vaults
        //call .asset method on underlyingVault0 and underlyingVault1 to get underlying tokens

        //do this under try and catch because the hook can be used if one of the currency is not a vault
        try {
          const underlyingVault0 = (
            await sdk.api.abi.call({
              chain: options.chain,
              target: event.currency0,
              abi: "address:asset",
            })
          ).output;
          poolsWithYieldHarvestingHook[poolId].underlyingVault0 =
            underlyingVault0;
        } catch {}
        try {
          const underlyingVault1 = (
            await sdk.api.abi.call({
              chain: options.chain,
              target: event.currency1,
              abi: "address:asset",
            })
          ).output;
          poolsWithYieldHarvestingHook[poolId].underlyingVault1 =
            underlyingVault1;
        } catch {}
        try {
          if (poolsWithYieldHarvestingHook[poolId].underlyingVault0) {
            const underlyingToken0 = (
              await sdk.api.abi.call({
                chain: options.chain,
                target: poolsWithYieldHarvestingHook[poolId].underlyingVault0!,
                abi: "address:asset",
              })
            ).output;
            poolsWithYieldHarvestingHook[poolId].underlyingToken0 =
              underlyingToken0;
          }
        } catch {}
        try {
          if (poolsWithYieldHarvestingHook[poolId].underlyingVault1) {
            const underlyingToken1 = (
              await sdk.api.abi.call({
                chain: options.chain,
                target: poolsWithYieldHarvestingHook[poolId].underlyingVault1!,
                abi: "address:asset",
              })
            ).output;
            poolsWithYieldHarvestingHook[poolId].underlyingToken1 =
              underlyingToken1;
          }
        } catch {}
      }
    }

    // Now get Swap events for the current time period
    const swapEvents = await sdk.getEventLogs({
      chain: options.chain,
      target: config.poolManager,
      eventAbi: SwapEvent,
      fromBlock: Number(options.fromApi.block),
      toBlock: Number(options.toApi.block),
      onlyArgs: true,
    });

    // Get Donate events for the current time period
    const donateEvents = await sdk.getEventLogs({
      chain: options.chain,
      target: config.poolManager,
      eventAbi: DonateEvent,
      fromBlock: Number(options.fromApi.block),
      toBlock: Number(options.toApi.block),
      onlyArgs: true,
    });

    // Process swap events only for pools with yield harvesting hook
    for (const event of swapEvents) {
      const poolId = String(event.id);

      if (poolsWithYieldHarvestingHook[poolId]) {
        const pool = poolsWithYieldHarvestingHook[poolId];
        const token =
          pool.underlyingToken0 || pool.underlyingVault0 || pool.currency0;
        dailyFees.add(
          token,
          Math.abs(Number(event.amount0)) * (Number(event.fee) / 1e6)
        );
        dailyVolume.add(token, Math.abs(Number(event.amount0)));
      }
    }

    // Process donate events only for pools with yield harvesting hook
    for (const event of donateEvents) {
      const poolId = String(event.id);

      if (poolsWithYieldHarvestingHook[poolId]) {
        const pool = poolsWithYieldHarvestingHook[poolId];
        const token0 =
          pool.underlyingToken0 || pool.underlyingVault0 || pool.currency0;

        // Donate amounts are also fees that go to LPs (they come from interest)
        dailyFees.add(token0, Math.abs(Number(event.amount0)));

        const token1 =
          pool.underlyingToken1 || pool.underlyingVault1 || pool.currency1;
        dailyFees.add(token1, Math.abs(Number(event.amount1)));
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
  methodology: {
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    SupplySideRevenue: "All fees and interest are distributed to LPs.",
  },
  fetch,
};

for (const [chain, config] of Object.entries(Configs)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    start: config.start,
  };
}

export default adapter;
