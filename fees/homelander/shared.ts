import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Shared between the volume adapter (dexs/homelander.ts) and the fee adapter
// (fees/homelander/index.ts): everything the Homelander plugin is deployed as
// on each chain, and one pass over a day of its pools' swaps.

export interface Distributor {
  address: string;
  /**
   * What the protocol keeps of a capture, and from which block.
   *
   * The weights are not in the payout event: they live in the distributor's own
   * share config, announced on chain as DefaultConfigSet / ConfigSet, and they
   * have been changed over the life of some deployments. Reading that history
   * on every run means scanning each distributor from its deploy block, which
   * the public nodes on one of these chains refuse outright, so the
   * announcements are transcribed here. Each entry is a block and what the
   * protocol's own payout addresses added up to from that block on, out of
   * 10,000.
   *
   * The protocol's addresses, for checking the entries against the chain:
   *   0x228148889505f14602458969e36f8546cd0f0354
   *   0xbab0cc82ca758dcfb27bbc030c554c3473959740
   * A third recipient appears beside them on several deployments and is counted
   * here as the pool's side, not the protocol's. Where that is wrong the
   * protocol's share is understated, never the reverse. An empty list means no
   * capture has settled through that distributor yet.
   */
  shares: [number, number][];
}

export interface ChainSettings {
  start: string;
  /**
   * How the pools state a swap. The extended event carries the rate the swap
   * paid; the classic one states it in a SwapFee log beside it.
   */
  swapEvent?: "classic" | "extended";
  /** the deployment's arbitrage executor, whose own legs are not trade the pool won */
  executor?: string;
  distributors?: Distributor[];
  /** plugins that pay liquidity providers inside the swap and never touch a distributor */
  donatingPlugins?: { plain?: string[]; indexedToken?: string[] };
  /**
   * The plugin factories on this chain. Each mints the per-pool plugin and
   * announces the pool it minted it for, so the set of pools is read from the
   * chain on every run and a pool opened later is counted without a code
   * change. `fromBlock` is the factory's own deploy block.
   */
  factories?: { address: string; fromBlock: number }[];
}

export const chainConfig: Record<string, ChainSettings> = {
  [CHAIN.BASE]: {
    start: "2026-03-26",
    swapEvent: "extended",
    executor: "0x3a980817e1522c532cc504dba5f5fee9e9096ac5",
    distributors: [
      // the deployment this protocol started with
      { address: "0x53c67db91f47923d26b0b85a345e484e32a6232f", shares: [[42873122, 5000], [46026125, 2500]] },
      { address: "0x10470434b3855016695cf18d456dae86b83e9239", shares: [[47159413, 0], [48050374, 1500]] },
      // pays a single recipient that is not the protocol
      { address: "0xd97d8624ee0be7b6e9b667a455a9d143df559cf3", shares: [[46030693, 0]] },
      // per-pool configs, each the pool creator and the protocol vault at half apiece
      { address: "0x55434f43bfb04839d53a2ca017e40614eb954b80", shares: [[46552099, 5000]] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0x68422147999c2d22b374adc4becdf48fea9fe9cf", shares: [] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xc4f7a22dd6964aeb23de87bf7ab313538d16b2c2", shares: [] },
    ],
    donatingPlugins: { plain: ["0xfad27bc5ef16a0a2aa3049953c25a48e8858b0c0", "0x1e549354366c480cc298919e014fb95ec0a370c0"] },
    factories: [
      { address: "0xa8dd4c05796801c734e99d5582e90e3a8bd88194", fromBlock: 42314036 },
      { address: "0xc3f2be91360d9ffc874e35b111780ccfb1a3ebce", fromBlock: 46026550 },
    ],
  },
  [CHAIN.FLARE]: {
    start: "2026-03-26",
    swapEvent: "classic",
    executor: "0xd9eb94fcd47f54f81841e6616e0a2f746556da26",
    distributors: [
      { address: "0x3cf6f6201be435c0527cab7ac6724c56616e0982", shares: [[57255039, 3000], [57255471, 0], [64075166, 1500]] },
    ],
    factories: [{ address: "0x9caa8f20b7ce0bd2d97f614a473a68ba6140970d", fromBlock: 56928287 }],
  },
  [CHAIN.POLYGON]: {
    start: "2026-06-10",
    swapEvent: "classic",
    executor: "0x6f680f333380e422d1d1071196af51a455946e35",
    distributors: [
      // its one announcement, at block 88,310,962, names a single recipient
      // and it is not the protocol's
      { address: "0xd4e31c8708d59dac665858dcc542329c15ed79a3", shares: [[88310962, 0]] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xd5a24b95db6a80322ea1cb6d457ecc0d129ec73b", shares: [] },
    ],
    factories: [{ address: "0xfe2041d7779a28fc6bf39223a952bad0beffd525", fromBlock: 85606804 }],
  },
  [CHAIN.SONEIUM]: {
    start: "2026-05-25",
    swapEvent: "extended",
    executor: "0x1f915fb5fb52bd32ae54d2b98009e12615605614",
    distributors: [
      { address: "0xab2ee1b9fce05a30e945d46477b96e9adcbb6766", shares: [[23329267, 0], [24877737, 1500]] },
    ],
    factories: [{ address: "0x672bb0a1ac120cb61ecdc6d2c3aa1e042f0eb941", fromBlock: 22852414 }],
  },
  [CHAIN.SOMNIA]: {
    start: "2026-05-25",
    swapEvent: "classic",
    executor: "0x1f915fb5fb52bd32ae54d2b98009e12615605614",
    distributors: [
      // Not transcribed, and not a verified zero: this chain's only working
      // public node caps a log query at a thousand blocks, its explorer does
      // not carry the address, and the announcement sits somewhere in the eight
      // million blocks between the distributor's deployment and its first
      // capture. Nothing here is counted as revenue until it can be read. The
      // deployment has distributed $3.65 in total since May, so what is at
      // stake is cents, and they are left out rather than assumed.
      { address: "0xab2ee1b9fce05a30e945d46477b96e9adcbb6766", shares: [] },
    ],
    factories: [{ address: "0x7b4553a35d3020064cb464a8d75a4735ffda15bd", fromBlock: 307452276 }],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-09-22",
    distributors: [
      // wired to a live plugin, nothing settled through it yet
      { address: "0xedc0e156afd811c81cf58ac08cb1f986786d3a37", shares: [] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xd478c8a11803ae872f8394440d66cec556fdaddd", shares: [] },
    ],
    donatingPlugins: { plain: ["0xa258ae996e8c887f5cbe1e0616d864eaa60c70c0"], indexedToken: ["0x7da09e3884e3041ad483053552ecc58e9b0b7454"] },
  },
};

/** `adapter` for a SimpleAdapter: the chains it runs on and when each starts. */


const swapClassicAbi =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)";
const swapExtendedAbi =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)";
const pluginCreatedAbi = "event PluginCreated(address indexed pool, address plugin)";
const swapFeeAbi = "event SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee)";

// The fee fields of the Swap and SwapFee events are millionths: an Algebra
// pool states its rate in hundredths of a basis point, so 3000 is 0.3%.
const FEE_DENOMINATOR = 1000000n;
// SHARE_DENOMINATOR on the distributor, whose share config weights the
// recipients of a capture out of 10,000.
const SHARE_DENOMINATOR = 10000n;

/** The protocol's weight for a capture, as it stood in the block it happened. */
export function protocolShareBps(chain: string, distributor: string, block: number): bigint {
  const entry = chainConfig[chain]?.distributors?.find((d) => d.address === distributor.toLowerCase());
  let bps = 0n;
  for (const [from, value] of entry?.shares ?? []) {
    if (from > block) break;
    bps = BigInt(value);
  }
  return bps;
}

export const shareOf = (amount: bigint, bps: bigint) => (amount * bps) / SHARE_DENOMINATOR;

export interface SwapTotals {
  /** volume, by token, excluding the plugin's own arbitrage legs */
  volume: Record<string, bigint>;
  /** what the trader paid in fee, by token, on the side the pool received */
  fees: Record<string, bigint>;
}

/**
 * One pass over a day of swaps, pool by pool.
 *
 * Where the pools speak the classic event the rate comes from its own SwapFee
 * log, and a swap is paired with the last rate stated before it in the same
 * transaction, by log index. That is what makes a transaction swapping the same
 * pool twice come out right, and it does not depend on the order the node
 * happens to return logs in.
 *
 * The plugin's own arbitrage legs are excluded from both figures, by their
 * sender. They are not trade the pool won, the plugin prices them at a
 * millionth of a percent, and counting them would report the protocol's own
 * round trips as somebody's volume.
 */
interface Pool {
  address: string;
  token0: string;
  token1: string;
}

/**
 * The pools the plugin runs in on this chain, read from the chain.
 *
 * Each plugin factory announces the pool it mints a plugin for, so one log
 * query per factory gives the whole set as it stood on the day being read, and
 * a pool opened later needs no code change. The pair is read from the pool
 * itself, since a PoolKey is not in the announcement.
 */
export async function getPools(options: FetchOptions): Promise<Pool[]> {
  const factories = chainConfig[options.chain]?.factories ?? [];
  const addresses: string[] = [];
  for (const { address, fromBlock } of factories) {
    const logs = await options.getLogs({
      target: address,
      eventAbi: pluginCreatedAbi,
      fromBlock,
      cacheInCloud: true,
    });
    for (const log of logs) addresses.push(String(log.pool).toLowerCase());
  }
  const pools = Array.from(new Set(addresses));
  if (!pools.length) return [];

  const token0 = await options.api.multiCall({ abi: "address:token0", calls: pools });
  const token1 = await options.api.multiCall({ abi: "address:token1", calls: pools });
  return pools.map((address, i) => ({
    address,
    token0: String(token0[i]).toLowerCase(),
    token1: String(token1[i]).toLowerCase(),
  }));
}

export async function collectSwaps(options: FetchOptions): Promise<SwapTotals> {
  const settings = chainConfig[options.chain];
  const volume: Record<string, bigint> = {};
  const fees: Record<string, bigint> = {};
  const pools = await getPools(options);
  if (!pools.length) return { volume, fees };

  const executor = settings.executor?.toLowerCase();
  const extended = settings.swapEvent === "extended";
  const logOptions = { entireLog: true, parseLog: true };
  const add = (bag: Record<string, bigint>, token: string, amount: bigint) => {
    if (amount <= 0n) return;
    bag[token] = (bag[token] ?? 0n) + amount;
  };
  const big = (v: any) => BigInt(v.toString());

  /**
   * The rates a classic-shape pool states beside its swaps, keyed by pool and
   * transaction and ordered by log index. Only the pools discovered above are
   * asked, never the chain at large.
   */
  const stated: Record<string, { logIndex: number; rate: bigint }[]> = {};
  if (!extended) {
    const feeLogs = await options.getLogs({
      targets: pools.map((pool) => pool.address),
      eventAbi: swapFeeAbi,
      ...logOptions,
    });
    for (const log of feeLogs) {
      const pool = String(log.address).toLowerCase();
      (stated[`${pool}|${log.transactionHash}`] ??= []).push({
        logIndex: Number(log.logIndex),
        rate: big(log.args.overrideFee) + big(log.args.pluginFee),
      });
    }
    for (const list of Object.values(stated)) list.sort((a, b) => a.logIndex - b.logIndex);
  }

  for (const { address: pool, token0, token1 } of pools) {
    const swaps = await options.getLogs({
      target: pool,
      eventAbi: extended ? swapExtendedAbi : swapClassicAbi,
      ...logOptions,
    });

    for (const log of swaps) {
      if (executor && String(log.args.sender).toLowerCase() === executor) continue;
      const amount0 = big(log.args.amount0);
      const amount1 = big(log.args.amount1);
      add(volume, token0, amount0 < 0n ? -amount0 : amount0);

      let rate = 0n;
      if (extended) {
        rate = big(log.args.overrideFee) + big(log.args.pluginFee);
      } else {
        const index = Number(log.logIndex);
        for (const entry of stated[`${pool}|${log.transactionHash}`] ?? []) {
          if (entry.logIndex > index) break;
          rate = entry.rate;
        }
      }
      if (rate <= 0n) continue;

      // the fee is paid on whichever side the pool received
      const [token, input] = amount0 > 0n ? [token0, amount0] : [token1, amount1];
      if (input > 0n) add(fees, token, (input * rate) / FEE_DENOMINATOR);
    }
  }

  return { volume, fees };
}
