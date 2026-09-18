import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { getPositionedLogArgs } from "../helpers/logs";
import { isCoreAsset } from "../helpers/prices";
import { formatAddress } from "../utils/utils";

// Calamari (docs.calamari.trade) is a standalone Uniswap-v4-styled DEX on Ink.
// It runs its OWN PoolManager singleton - NOT the official Uniswap Labs v4
// deployment that dexs/uniswap-v4.ts already tracks on Ink (0x360e68fa...).
// Same event/ABI shapes because it is a straight redeploy of v4-core (verified
// on Ink's blockscout, additional_sources match lib/v4-core/src/* byte for
// byte).
// https://explorer.inkonchain.com/address/0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560
const POOL_MANAGER = "0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560";
// PoolManager creation tx (2026-08-31): 0x0e3e5b7be809fb3b7adabf0ee9ae32897c6a8b05a6f2a8c00a0c128783ac2eda
const DEPLOY_BLOCK = 54652108;

const InitializeEvent =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const SwapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// v4-core's own protocol-fee-switch event. Confirmed firing on Calamari's PoolManager (386
// events as of 2026-09-18) - the on-chain proof that Calamari genuinely takes a protocol cut,
// not a pure-LP-fee DEX: every pool starts at 0% and stays there until this event names it.
// InkProtocolFeeController (0xe7297c70f788e1d28bc2cfe2b2f8403d76748994) permissionlessly stamps
// pools it reaches with packFee(1000, 1000) - v4-core's ProtocolFeeLibrary.MAX_PROTOCOL_FEE, the
// maximum 0.1% allowed in each direction. As of 2026-09-18, 386 of 593 pools ever initialized
// have been stamped; the rest are simply not reached yet (the sweep is permissionless and lags
// new launches) - either way this event, not an assumed constant, is the source of truth per pool.
const ProtocolFeeUpdatedEvent = "event ProtocolFeeUpdated(bytes32 indexed id, uint24 protocolFee)";

const PIPS = 1_000_000n;

const LABEL = {
  SwapFees: "Swap Fees",
  ToLPs: "Swap Fees To LPs",
  ToProtocol: "Swap Fees To Protocol",
};

type Pool = { currency0: string; currency1: string };
type FeeChange = { blockNumber: number; logIndex: number; protocolFee: number };

const abs = (v: bigint) => (v < 0n ? -v : v);

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Pool registry, built from every Initialize this PoolManager has ever emitted - a small,
  // slowly-growing config scan (593 pools in the first 18 days), the sanctioned use of
  // cacheInCloud.
  const initLogs = await getPositionedLogArgs(options, {
    target: POOL_MANAGER,
    eventAbi: InitializeEvent,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const pools = new Map<string, Pool>();
  for (const log of initLogs) {
    pools.set(String(log.id).toLowerCase(), {
      currency0: formatAddress(log.currency0),
      currency1: formatAddress(log.currency1),
    });
  }

  // Every protocol-fee change ever made, per pool - also a small, slowly growing config scan,
  // also cached. A pool with no entry here has never been stamped and is still earning the
  // protocol nothing (see comment on ProtocolFeeUpdatedEvent above).
  const feeLogs = await getPositionedLogArgs(options, {
    target: POOL_MANAGER,
    eventAbi: ProtocolFeeUpdatedEvent,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const feeTimelines = new Map<string, FeeChange[]>();
  for (const log of feeLogs) {
    const id = String(log.id).toLowerCase();
    const arr = feeTimelines.get(id) ?? [];
    arr.push({ blockNumber: log.blockNumber, logIndex: log.logIndex, protocolFee: Number(log.protocolFee) });
    feeTimelines.set(id, arr);
  }
  for (const arr of feeTimelines.values()) arr.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  // The packed protocolFee active for `poolId` at the swap's exact position - replaying
  // ProtocolFeeUpdated events ordered by (blockNumber, logIndex) rather than a single snapshot
  // read, so a pool stamped mid-window still splits that window's earlier swaps at 0% and its
  // later ones at the new rate. v4-core's ProtocolFeeLibrary packs two 12-bit fields: the low
  // bits for the zeroForOne direction, the high bits for oneForZero.
  const protocolFeeAt = (poolId: string, blockNumber: number, logIndex: number): number => {
    const timeline = feeTimelines.get(poolId);
    if (!timeline) return 0;
    let current = 0;
    for (const change of timeline) {
      if (change.blockNumber > blockNumber || (change.blockNumber === blockNumber && change.logIndex > logIndex)) break;
      current = change.protocolFee;
    }
    return current;
  };

  const blacklistTokens = new Set(getDefaultDexTokensBlacklisted(chain));

  const swapLogs = await getPositionedLogArgs(options, { target: POOL_MANAGER, eventAbi: SwapEvent });

  for (const log of swapLogs) {
    const poolId = String(log.id).toLowerCase();
    const pool = pools.get(poolId);
    if (!pool) {
      // Should not happen - Initialize always precedes any Swap for a pool - skip rather than
      // guess so one anomaly doesn't take the whole day down.
      continue;
    }
    const { currency0, currency1 } = pool;
    if (blacklistTokens.has(currency0) || blacklistTokens.has(currency1)) continue;

    const amount0 = BigInt(log.amount0);
    const amount1 = BigInt(log.amount1);
    // Positive amount = the pool's balance of that token increased, i.e. the trader gave it to
    // the pool - the v4 zeroForOne convention.
    const zeroForOne = amount0 > 0n;

    // Price via the native coin or a core asset where possible, so long-tail launch tokens with
    // thin liquidity never set the USD value - same preference dexs/uniswap-v4.ts applies.
    const useToken0 = currency0 === ADDRESSES.null || isCoreAsset(chain, currency0) || !isCoreAsset(chain, currency1);
    const token = useToken0 ? currency0 : currency1;
    const amount = useToken0 ? abs(amount0) : abs(amount1);

    const swapFee = BigInt(log.fee); // total fee actually charged this swap (LP + protocol), v4's own number
    const packedProtocolFee = protocolFeeAt(poolId, log.blockNumber, log.logIndex);
    const protocolFeeRate = BigInt(zeroForOne ? packedProtocolFee & 0xfff : (packedProtocolFee >> 12) & 0xfff);

    const totalFee = (amount * swapFee) / PIPS;
    // Exact per v4-core's ProtocolFeeLibrary: the protocol fee is taken off the input FIRST,
    // then the LP fee is taken from what's left, so the protocol's cut of the input is just
    // amount * protocolFee / 1e6 - independent of the LP fee - and the two always sum to totalFee.
    const protocolCut = (amount * protocolFeeRate) / PIPS;
    const lpCut = totalFee - protocolCut;

    const add = (balances: typeof dailyVolume, amt: bigint, label?: string) => {
      if (token === ADDRESSES.null) balances.addGasToken(amt, label);
      else balances.add(token, amt, label);
    };

    add(dailyVolume, amount);
    add(dailyFees, totalFee, LABEL.SwapFees);
    add(dailyRevenue, protocolCut, LABEL.ToProtocol);
    add(dailyProtocolRevenue, protocolCut, LABEL.ToProtocol);
    add(dailySupplySideRevenue, lpCut, LABEL.ToLPs);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Swap volume on Calamari's own PoolManager singleton on Ink (a separate deployment from the official Uniswap Labs v4 PoolManager that dexs/uniswap-v4.ts tracks), read from Swap events and priced off the native/core-asset side of each trade.",
  Fees: "The total swap fee charged on every trade (LP fee plus protocol fee), read directly from the Swap event's own `fee` field.",
  UserFees: "Same as Fees: the whole swap fee is paid by the trader.",
  Revenue: "The protocol's cut of the swap fee, taken via v4-core's native protocol-fee switch. Every pool starts at 0%; Calamari's InkProtocolFeeController permissionlessly stamps pools with the maximum v4 allows (0.1% of the input in each direction) once it reaches that pool, read here from the ProtocolFeeUpdated event so a pool stamped mid-window still splits correctly.",
  ProtocolRevenue: "Same as Revenue - Calamari has no token and no on-chain holder distribution, so nothing is split out as holders revenue.",
  SupplySideRevenue: "The remainder of the swap fee, after the protocol's cut, paid to the pool's LPs.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapFees]: "Total swap fee (LP + protocol) reported on the Swap event, in the input token.",
  },
  UserFees: {
    [LABEL.SwapFees]: "Total swap fee (LP + protocol) reported on the Swap event, in the input token.",
  },
  Revenue: {
    [LABEL.ToProtocol]: "v4-core's protocol-fee cut of the swap, per the pool's own ProtocolFeeUpdated history (0% until stamped, then up to 0.1% each direction - the only rate Calamari's fee controller has ever applied).",
  },
  ProtocolRevenue: {
    [LABEL.ToProtocol]: "v4-core's protocol-fee cut of the swap, per the pool's own ProtocolFeeUpdated history (0% until stamped, then up to 0.1% each direction - the only rate Calamari's fee controller has ever applied).",
  },
  SupplySideRevenue: {
    [LABEL.ToLPs]: "Swap fee remaining after the protocol's cut, paid to the pool's liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.INK],
  start: "2026-08-31", // PoolManager deployment, block 54652108
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
