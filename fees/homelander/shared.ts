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
   * Named pools, each as [pool, token0, token1]. Used on chains whose public
   * nodes cannot serve a factory's PluginCreated history or a token0/token1
   * read. A pool opened later is counted once it is added here. The pair is
   * named with the pool so a day needs no eth_call either.
   */
  pools?: [string, string, string][];
  /**
   * The plugin factories on this chain. Each mints the per-pool plugin and
   * announces the pool it minted it for, so the set of pools is read from the
   * chain on every run and a pool opened later is counted without a code
   * change. `fromBlock` is the factory's own deploy block. Omitted where the
   * public nodes cannot serve that history; those chains name `pools` instead.
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
    // Named rather than discovered: the public nodes on this chain do not serve
    // the factory's PluginCreated history. Factory 0x9caa8f20b7ce0bd2d97f614a473a68ba6140970d, deploy block 56928287.
    pools: [
      ["0x019b44755d79df3f75611c1c98a60ceba3632fc0", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x160fd9592585890bbcee2a9dc92a496d0958a17a", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3"],
      ["0x19228319d394d871e78e428286418c5df3b9d857", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x1e806f18638e2e89ab42e94a9a619ffec203b84b", "0x1502fa4be69d526124d453619276faccab275d3d", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0x26796ccb9867757cedbd62a5a9e0fa73bec8ca3b", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x2a91d9296ee2fe4139b49c7071b2f29f59a9f9ae", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0x321621bf87037ff2f6438530b5f0f11c8837ad22", "0x0988c6ba244a90c07a917ebe609eb3264be716ff", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0"],
      ["0x3df8071169743c2de79ec0864fc2d8ed744cb37a", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3"],
      ["0x488d13f980609a38565cc8bddc6987f069c65749", "0x1502fa4be69d526124d453619276faccab275d3d", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x54b971682f4438ebd0c3ff4dcba67fb7e16b9de4", "0x0988c6ba244a90c07a917ebe609eb3264be716ff", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x5cb9513643a02ef838f64302e3e889914ed3445b", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0"],
      ["0x66050ed5ae1a455faf707b740ec63485cf105153", "0xd8bf1d2720e9ffd01a2f9a2efc3e101a05b852b4", "0xfbda5f676cb37624f28265a144a48b0d6e87d3b6"],
      ["0x79af232ae7ccd460439af3515022c10f5509d9f8", "0x1502fa4be69d526124d453619276faccab275d3d", "0x26a1fab310bd080542dc864647d05985360b16a5"],
      ["0x927485d88a66253c63af9163dca5f21c25a57393", "0xad552a648c74d49e10027ab8a618a3ad4901c5be", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x9f6c46f190351275e47d7ad8d3f2c9487569211e", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0xbfe5eafd86cf270cf0ecca07f4fd0de67ee8bcfb", "0x1502fa4be69d526124d453619276faccab275d3d", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0xc39659c230b5420b571c40457c73acf4b8939aac", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0xdcea6d3d7ca3b67c02d2b242a9037f8afe613c27", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", "0xfbda5f676cb37624f28265a144a48b0d6e87d3b6"],
      ["0xea17e8634ce3a1dcea776df65b740772d43576a5", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0xd8bf1d2720e9ffd01a2f9a2efc3e101a05b852b4"],
    ],
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
    // Named rather than discovered: the public nodes on this chain do not serve
    // the factory's PluginCreated history. Factory 0x672bb0a1ac120cb61ecdc6d2c3aa1e042f0eb941, deploy block 22852414.
    pools: [
      ["0x4e13c7fd28fe96fa5992e7df7d882358629de03a", "0x4200000000000000000000000000000000000006", "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369"],
      ["0x88deb61d597bf26b643293570f5952e2adc01157", "0x0555e30da8f98308edb960aa94c0db47230d2b9c", "0x4200000000000000000000000000000000000006"],
      ["0xd8b3fbc6ab2bfab6e31a770643e40451050e9ce4", "0x13a82039af463ae967b105e4961e1a121fe543f3", "0x4200000000000000000000000000000000000006"],
      ["0xeaae7128976870fc43545c09685fc14706bfb87d", "0x2cae934a1e84f693fbb78ca5ed3b0a6893259441", "0xcb46843fe775eec8499ccf18fb48b915a3dae207"],
    ],
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
    // Named rather than discovered: the public nodes on this chain do not serve
    // the factory's PluginCreated history. Factory 0x7b4553a35d3020064cb464a8d75a4735ffda15bd, deploy block 307452276.
    pools: [
      ["0xe5467be8b8db6b074904134e8c1a581f5565e2c3", "0x046ede9564a72571df6f5e44d0405360c0f4dcab", "0x28bec7e30e6faee657a03e19bf1128aad7632a00"],
    ],
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
 * One pass over a day of swaps.
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
 * The pools the plugin runs in on this chain.
 *
 * Where the chain names its pools, that list is used: those public nodes cannot
 * serve the factory history or an archive token read. Everywhere else each
 * plugin factory announces the pool it mints a plugin for, so one log query
 * across the factories gives the whole set as it stood on the day being read,
 * and a pool opened later needs no code change. The pair is then read from the
 * pool itself, since a PoolKey is not in the announcement.
 */
export async function getPools(options: FetchOptions): Promise<Pool[]> {
  const named = chainConfig[options.chain]?.pools;
  if (named?.length) {
    return named.map(([address, token0, token1]) => ({
      address: address.toLowerCase(),
      token0: token0.toLowerCase(),
      token1: token1.toLowerCase(),
    }));
  }

  const factories = chainConfig[options.chain]?.factories ?? [];
  if (!factories.length) return [];

  const logs = await options.getLogs({
    targets: factories.map((factory) => factory.address),
    eventAbi: pluginCreatedAbi,
    fromBlock: Math.min(...factories.map((factory) => factory.fromBlock)),
    cacheInCloud: true,
  });
  const pools = Array.from(new Set(logs.map((log) => String(log.pool).toLowerCase())));
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

  const byPool: Record<string, { token0: string; token1: string }> = {};
  for (const pool of pools) byPool[pool.address] = { token0: pool.token0, token1: pool.token1 };

  const swaps = await options.getLogs({
    targets: pools.map((pool) => pool.address),
    eventAbi: extended ? swapExtendedAbi : swapClassicAbi,
    ...logOptions,
  });

  for (const log of swaps) {
    const pool = String(log.address).toLowerCase();
    const tokens = byPool[pool];
    if (!tokens) continue;
    if (executor && String(log.args.sender).toLowerCase() === executor) continue;
    const amount0 = big(log.args.amount0);
    const amount1 = big(log.args.amount1);
    add(volume, tokens.token0, amount0 < 0n ? -amount0 : amount0);

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
    const [token, input] = amount0 > 0n ? [tokens.token0, amount0] : [tokens.token1, amount1];
    if (input > 0n) add(fees, token, (input * rate) / FEE_DENOMINATOR);
  }

  return { volume, fees };
}
