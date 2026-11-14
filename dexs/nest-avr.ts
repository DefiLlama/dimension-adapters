import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { dedupeLogs } from "../helpers/elyspump";
import { isCoreAsset } from "../helpers/prices";

// nest AVR (https://www.usenest.xyz, https://x.com/NestExchange): nest's Uniswap v4 pools on Elysium. nest's factory deploys a hook per
// pool and initializes it on the official PoolManager; LPs mint through the official PositionManager, so dexs/uniswap-v4 counts the same swaps.

const POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1"; // official Uniswap v4 PoolManager on Elysium
const NEST_POOL_FACTORY = "0x24c1e5076230a496083a23d7c00482d982a06171"; // e.g. tx 0x7c7197a181659ec0aa313f4c4b5fc78eed64414251dc932495be540183c79635
const FACTORY_FROM_BLOCK = 1501298; // factory deployment, 2026-11-06

// hook source is not published: types matched against on-chain topic0
const POOL_CREATED = "event PoolCreated(address indexed hook, bytes32 indexed poolId, bytes32 salt, address implementation)";
const HOOK_POOL_KEY = "function poolKey() view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

// The hook keeps 10% of the LP fees each position collects, sent to nest's levy recipient 0xdb180c83029577a1cb323542ec796fa4cc7b8f51.
// No public getter: all levy logs through 2026-11-14 are 10%, e.g. tx 0xb189d0a2ed8c0707ef31703888be49d25360b6eb581c5b082a73389c0e6d75fe
const LEVY_SHARE = 0.1;

const LABEL = {
  swapFees: "Swap Fees",
  toLps: "Swap Fees To LPs",
  toProtocol: "Swap Fees To Protocol",
};

const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const created = await options.getLogs({ target: NEST_POOL_FACTORY, eventAbi: POOL_CREATED, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true });
  const keys = await options.api.multiCall({ abi: HOOK_POOL_KEY, calls: created.map((l: any) => l.hook) });
  const pools: Record<string, { currency0: string, currency1: string }> = {};
  created.forEach((l: any, i: number) => {
    pools[lower(l.poolId)] = { currency0: lower(keys[i].currency0), currency1: lower(keys[i].currency1) };
  });
  const poolIds = Object.keys(pools);

  const swapLogs: any[] = [];
  for (let i = 0; i < poolIds.length; i += 200) {
    const chunk = poolIds.slice(i, i + 200);
    swapLogs.push(...await options.getLogs({ target: POOL_MANAGER, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
  }

  for (const { args } of dedupeLogs(swapLogs)) {
    const { currency0, currency1 } = pools[lower(args.id)];
    const use0 = isCoreAsset(options.chain, currency0) || !isCoreAsset(options.chain, currency1);
    const amount = abs(BigInt(use0 ? args.amount0 : args.amount1));
    const token = use0 ? currency0 : currency1;
    dailyVolume.add(token, amount);
    dailyFees.add(token, (amount * BigInt(args.fee)) / 1_000_000n, LABEL.swapFees); // v4 fee is in hundredths of a bip
  }

  const dailyRevenue = dailyFees.clone(LEVY_SHARE, LABEL.toProtocol);
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue: dailyFees.clone(1 - LEVY_SHARE, LABEL.toLps),
  };
};

const methodology = {
  Volume: "Value of every swap in nest's Uniswap v4 pools on Elysium.",
  Fees: "Swap fees paid by traders in nest's Uniswap v4 pools on Elysium.",
  UserFees: "Swap fees paid by traders in nest's Uniswap v4 pools on Elysium.",
  Revenue: "nest's 10% levy on the swap fees earned by liquidity providers, taken by nest's hook when fees are collected.",
  ProtocolRevenue: "nest's 10% levy on liquidity providers' swap fees, sent to nest's levy recipient wallet.",
  SupplySideRevenue: "The 90% of swap fees kept by liquidity providers after nest's levy.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "Swap fees paid by traders on every swap.",
  },
  UserFees: {
    [LABEL.swapFees]: "Swap fees paid by traders on every swap.",
  },
  Revenue: {
    [LABEL.toProtocol]: "10% of swap fees, levied by nest's hook on the fees liquidity providers collect.",
  },
  ProtocolRevenue: {
    [LABEL.toProtocol]: "10% of swap fees, sent to nest's levy recipient wallet.",
  },
  SupplySideRevenue: {
    [LABEL.toLps]: "90% of swap fees, kept by liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-06",
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
