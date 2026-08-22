import { BaseAdapter, FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { isCoreAsset } from "../helpers/prices";

// Fables — a dynamic-fee ve(3,3) DEX built on Uniswap v4 on Robinhood Chain.
//
// Fables initializes its pools directly on the canonical v4 PoolManager, not through Uniswap's
// PositionManager, so dexs/uniswap-v4.ts cannot resolve their poolKeys and skips them (verified:
// PositionManager.poolKeys returns the zero key for every Fables pool). This adapter is therefore
// the only place Fables swap volume is counted, and it does not overlap with the Uniswap v4 adapter.
//
// Pools are enumerated from the on-chain FablesPoolRegistry (activePools), so registering or
// retiring a pool there automatically starts or stops tracking here — no pool is hardcoded. Each
// pool's swaps are read directly by its indexed pool id, rather than scanning the whole PoolManager
// (which carries every other protocol's Robinhood v4 traffic too).

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"; // Uniswap v4 PoolManager on Robinhood
const REGISTRY = "0x159a113e012593d9b3cc63ad45e30f0467e13ef3"; // FablesPoolRegistry
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"; // v4 Swap topic0

const SwapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const ActivePoolsAbi =
  "function activePools() view returns (tuple(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bytes32 id, bool active)[])";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const pools = await options.api.call({ target: REGISTRY, abi: ActivePoolsAbi });

  for (const p of pools) {
    const currency0 = String(p.key.currency0);
    const currency1 = String(p.key.currency1);

    // Only this pool's swaps: the pool id is topic1 of the indexed Swap event.
    const logs = await options.getLogs({
      target: POOL_MANAGER,
      eventAbi: SwapEvent,
      topics: [SWAP_TOPIC, p.id],
    });
    if (!logs.length) continue;

    // Price on the native / core-asset leg where possible so a thin-liquidity token can't set value.
    const useToken0 =
      currency0 === ADDRESSES.null ||
      isCoreAsset(options.chain, currency0) ||
      !isCoreAsset(options.chain, currency1);
    const token = useToken0 ? currency0 : currency1;

    for (const log of logs) {
      const amount = Math.abs(Number(useToken0 ? log.amount0 : log.amount1));
      dailyVolume.add(token, amount);
      dailyFees.add(token, (amount * Number(log.fee)) / 1e6); // dynamic fee carried in each Swap event
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees, // fees accrue to LPs; no protocol fee switch yet
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Swap volume across every Fables pool, enumerated from the on-chain FablesPoolRegistry (activePools) and read from the Uniswap v4 PoolManager Swap logs by each pool's indexed id, counted on the core-asset/native leg. Fables pools are not counted by the Uniswap v4 adapter (their poolKeys are not registered in Uniswap's PositionManager), so there is no overlap.",
  Fees: "Swap fees paid by users, using the dynamic fee carried in each Swap event.",
  UserFees: "Swap fees paid by users.",
  SupplySideRevenue: "All swap fees accrue to liquidity providers; Fables takes no protocol fee yet.",
  Revenue: "No protocol fee is enabled yet.",
  ProtocolRevenue: "No protocol fee is enabled yet.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-08-15" },
  } as BaseAdapter,
  methodology,
};

export default adapter;
