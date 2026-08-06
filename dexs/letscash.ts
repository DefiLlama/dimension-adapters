import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

// LetsCash is a fair-launch venue on Robinhood Chain. Its launches become
// Uniswap v4 pools, so the underlying swaps are already covered by the generic
// Uniswap v4 adapter and this adapter is explicitly doublecounted.
// Sources: https://www.letscash.fun/docs
// Factory: https://robinhoodchain.blockscout.com/address/0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661
// PoolManager: https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951
const FACTORY = "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661";
// First TokenLaunched block observed for the factory:
// https://robinhoodchain.blockscout.com/block/6160467
const FIRST_LAUNCH_BLOCK = 6160467;
// First block containing the vNext LaunchConfigAdded tuple:
// https://robinhoodchain.blockscout.com/block/28894154
const VNEXT_CONFIG_BLOCK = 28894154;

const TOKEN_LAUNCHED_EVENT =
  "event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, uint256 firstBuyIn, uint256 firstBuyOut, address hook, address feeRecipient)";

// The factory was upgraded in place. Current configuration events are queried
// below; immutable legacy configurations are listed in LEGACY_CONFIGS.
const VNEXT_CONFIG_EVENT =
  "event LaunchConfigAdded(uint256 indexed configId, tuple(uint256 moduleSetId, address quote, uint256 supply, int24 tickSpacing, int24 startTick, uint16 creatorFeeBps, uint24 feeRate, bool enabled, bool selfBurn, bool exists) config)";

const FEE_ACCRUED_EVENT = "event FeeAccrued(bytes32 indexed poolId, uint256 amount)";

// creatorFeeBps and platform-share values use the factory's basis-point
// denominator, where 10,000 represents 100%:
// https://robinhoodchain.blockscout.com/address/0x3dFd73A63E15920aDd4B6c5C6a4b1b4B768b2c1A?tab=contract
const BPS = 10_000n;
// LaunchConfig.feeRate is expressed in parts per million (10,000 = 1%), so
// this converts FeeAccrued back to quote volume:
// https://robinhoodchain.blockscout.com/address/0x3dFd73A63E15920aDd4B6c5C6a4b1b4B768b2c1A?tab=contract
const FEE_RATE_DENOMINATOR = 1_000_000n;
const PLATFORM_FEES = "Platform Fees";
// LetsCash documents a fixed platform split: 25% CASHCAT buyback-and-burn,
// 25% treasury buyback, and 50% operations. The burn lane is holder revenue:
// https://www.letscash.fun/about
const PLATFORM_BURN_SHARE_BPS = 2_500n;

// These immutable legacy configurations were emitted before the factory's
// vNext implementation. The old struct did not carry a quote address; all
// legacy pools use native ETH. Values are from the factory's LaunchConfigAdded
// events, retained here because the public log indexer does not consistently
// return the pre-upgrade tuple event. The selfBurn flags match the retired
// factory array: modes 15 and 17 route the creator share to self-burners.
// Source: https://robinhoodchain.blockscout.com/address/0x3dFd73A63E15920aDd4B6c5C6a4b1b4B768b2c1A?tab=contract
const LEGACY_CONFIGS: Record<string, { creatorFeeBps: bigint; feeRate: bigint; selfBurn: boolean }> = {
  "0": { creatorFeeBps: 5000n, feeRate: 10000n, selfBurn: false },
  "1": { creatorFeeBps: 7500n, feeRate: 20000n, selfBurn: false },
  "2": { creatorFeeBps: 8334n, feeRate: 30000n, selfBurn: false },
  "3": { creatorFeeBps: 8750n, feeRate: 40000n, selfBurn: false },
  "4": { creatorFeeBps: 9000n, feeRate: 50000n, selfBurn: false },
  "5": { creatorFeeBps: 9167n, feeRate: 60000n, selfBurn: false },
  "6": { creatorFeeBps: 9286n, feeRate: 70000n, selfBurn: false },
  "7": { creatorFeeBps: 9375n, feeRate: 80000n, selfBurn: false },
  "8": { creatorFeeBps: 9445n, feeRate: 90000n, selfBurn: false },
  "9": { creatorFeeBps: 9500n, feeRate: 100000n, selfBurn: false },
  "10": { creatorFeeBps: 9546n, feeRate: 110000n, selfBurn: false },
  "11": { creatorFeeBps: 9584n, feeRate: 120000n, selfBurn: false },
  "12": { creatorFeeBps: 9616n, feeRate: 130000n, selfBurn: false },
  "13": { creatorFeeBps: 9643n, feeRate: 140000n, selfBurn: false },
  "14": { creatorFeeBps: 9667n, feeRate: 150000n, selfBurn: false },
  "15": { creatorFeeBps: 5000n, feeRate: 10000n, selfBurn: true },
  "16": { creatorFeeBps: 7000n, feeRate: 10000n, selfBurn: false },
  "17": { creatorFeeBps: 7000n, feeRate: 10000n, selfBurn: true },
};

type LaunchConfig = {
  quote: string;
  creatorFeeBps: bigint;
  feeRate: bigint;
  selfBurn: boolean;
};

type PoolInfo = LaunchConfig & {
  token: string;
};

type Discovery = {
  pools: Record<string, PoolInfo>;
  hooks: string[];
};

// The test runner backfills 24 hourly windows in one process. Extend this
// discovery incrementally as the hourly end block advances, rather than
// replaying the full launch history once per hour.
const configs: Record<string, LaunchConfig> = {};
for (const [configId, config] of Object.entries(LEGACY_CONFIGS)) {
  configs[configId] = { quote: ADDRESSES.null, ...config };
}
const pools: Record<string, PoolInfo> = {};
const hooks = new Set<string>();
let discoveryToBlock = FIRST_LAUNCH_BLOCK - 1;
let discoveryPromise: Promise<void> | undefined;

/** Converts a decoded log value into a bigint without depending on its ABI wrapper. */
function asBigInt(value: any): bigint {
  return BigInt(String(value));
}

/** Normalizes an address-like decoded log value for case-insensitive lookups. */
function asAddress(value: any): string {
  return String(value).toLowerCase();
}

/**
 * Discovers launch configurations, pools, and fee hooks up to the current API block.
 *
 * Discovery is extended incrementally because the adapter is called once per hour
 * during a backfill and the factory's launch history is append-only.
 */
async function discoverPools(options: FetchOptions): Promise<Discovery> {
  const toBlock = Number(options.toApi.block);
  if (toBlock <= discoveryToBlock) return { pools, hooks: [...hooks] };
  if (discoveryPromise) await discoveryPromise;
  if (toBlock <= discoveryToBlock) return { pools, hooks: [...hooks] };

  const { getLogs } = options;
  const fromBlock = discoveryToBlock + 1;
  discoveryPromise = (async () => {
    const [vnextConfigLogs, launchLogs] = await Promise.all([
      toBlock >= VNEXT_CONFIG_BLOCK
        ? getLogs({ target: FACTORY, eventAbi: VNEXT_CONFIG_EVENT, fromBlock: Math.max(fromBlock, VNEXT_CONFIG_BLOCK), toBlock, entireLog: true, cacheInCloud: true })
        : Promise.resolve([]),
      getLogs({ target: FACTORY, eventAbi: TOKEN_LAUNCHED_EVENT, fromBlock: Math.max(fromBlock, FIRST_LAUNCH_BLOCK), toBlock, entireLog: true, cacheInCloud: true }),
    ]);

    for (const log of vnextConfigLogs) {
      const config = log.args.config;
      configs[String(log.args.configId)] = {
        quote: asAddress(config.quote),
        creatorFeeBps: asBigInt(config.creatorFeeBps),
        feeRate: asBigInt(config.feeRate),
        selfBurn: Boolean(config.selfBurn),
      };
    }

    for (const log of launchLogs) {
      const args = log.args;
      const configId = String(args.configId);
      const config = configs[configId];
      if (!config) throw new Error(`LetsCash: missing launch config ${configId}`);

      const poolId = String(args.poolId).toLowerCase();
      pools[poolId] = { ...config, token: asAddress(args.token) };
      hooks.add(asAddress(args.hook));
    }

    discoveryToBlock = toBlock;
  })();

  try {
    await discoveryPromise;
  } finally {
    discoveryPromise = undefined;
  }
  return { pools, hooks: [...hooks] };
}

/** Fetches LetsCash quote volume, total fees, platform revenue, and creator revenue. */
async function fetch(options: FetchOptions) {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const { pools, hooks } = await discoverPools(options);

  // Query only pool hooks discovered from the factory. This covers the legacy
  // hook and all future hook generations without hardcoding an incomplete list.
  const feeLogs = hooks.length
    ? await getLogs({ targets: hooks, eventAbi: FEE_ACCRUED_EVENT })
    : [];

  for (const log of feeLogs) {
    const args = log.args ?? log;
    const pool = pools[String(args.poolId).toLowerCase()];
    if (!pool) throw new Error(`LetsCash: FeeAccrued for unknown pool ${args.poolId}`);

    const totalFee = asBigInt(args.amount);
    if (pool.feeRate === 0n) throw new Error(`LetsCash: zero fee rate for pool ${args.poolId}`);
    const volume = (totalFee * FEE_RATE_DENOMINATOR) / pool.feeRate;
    const creatorFee = (totalFee * pool.creatorFeeBps) / BPS;
    const platformFee = totalFee - creatorFee;
    const platformBuyback = (platformFee * PLATFORM_BURN_SHARE_BPS) / BPS;
    const selfBurnFee = pool.selfBurn ? creatorFee : 0n;
    const creatorRevenue = pool.selfBurn ? 0n : creatorFee;

    dailyVolume.add(pool.quote, volume);
    dailyFees.add(pool.quote, totalFee, METRIC.SWAP_FEES);
    dailyRevenue.add(pool.quote, platformFee, PLATFORM_FEES);
    dailyProtocolRevenue.add(pool.quote, platformFee - platformBuyback, PLATFORM_FEES);
    dailyHoldersRevenue.add(pool.quote, platformBuyback, METRIC.TOKEN_BUY_BACK);
    if (pool.selfBurn) {
      dailyRevenue.add(pool.quote, selfBurnFee, METRIC.TOKEN_BUY_BACK);
      dailyHoldersRevenue.add(pool.quote, selfBurnFee, METRIC.TOKEN_BUY_BACK);
    } else {
      dailySupplySideRevenue.add(pool.quote, creatorRevenue, METRIC.CREATOR_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-10",
  fetch,
  doublecounted: true,
  methodology: {
    Volume: "Quote-currency volume reconstructed from each hook's FeeAccrued amount and the pool's on-chain feeRate (fee × 1,000,000 ÷ feeRate). Native ETH and USDG pools are priced by DefiLlama from the quote asset.",
    Fees: "Total launch-tax fees emitted by LetsCash hooks through FeeAccrued events. The launch configuration's fee rate is already reflected in the emitted amount.",
    Revenue: "The platform share of launch-tax fees, plus the creator share for self-burn pools because that share buys and burns the launched token.",
    ProtocolRevenue: "75% of the platform share, with the other 25% used for the CASHCAT buyback-and-burn lane.",
    HoldersRevenue: "25% of the platform share used to buy and burn CASHCAT, plus 100% of the creator share for self-burn pools.",
    SupplySideRevenue: "The creator share of launch-tax fees for standard pools; self-burn pools have no creator payout.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Total fee amount emitted by the LetsCash hook for each pool trade.",
    },
    Revenue: {
      [PLATFORM_FEES]: "The fee amount retained by LetsCash after the creator share defined in the pool's launch configuration.",
      [METRIC.TOKEN_BUY_BACK]: "The creator share of self-burn pools, used to buy and burn the launched token.",
    },
    ProtocolRevenue: {
      [PLATFORM_FEES]: "75% of the platform share retained for treasury and operations; 25% funds CASHCAT buyback-and-burn.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "25% of the platform share buys and burns CASHCAT; self-burn creator shares buy and burn the launched token.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "The creator share defined in the pool's launch configuration.",
    },
  },
};

export default adapter;
