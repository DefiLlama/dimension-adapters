import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// CircleWarp (circlewarp.fun, "Warp") volume on Arc: bonding-curve trading, plus swaps in
// the pools of tokens that have graduated. See fees/circlewarp for the fee/revenue side and
// the on-chain verification notes for every address and number below.
//
// A launched token trades against its own curve until it graduates, then trades in a WarpDex
// pool (CircleWarp's own Uniswap V2 fork) instead. Both legs are needed for the full volume
// picture, so curve trades and graduated-pool swaps are summed here.
const LAUNCH_FACTORY = "0x0dCad158e98bC24455f9e94F46709d8a5F6D1255";
// CircleWarp was live before Arc's 2026-09-16 public mainnet launch; only counting
// from public launch, so this is that boundary block, not the real deploy block.
const LAUNCH_FACTORY_DEPLOY_BLOCK = 21068653;
const WARPDEX_FACTORY = "0x32330C2400a6e0830D56661169eBB6C147E3577a";

// Volume is read from the USDC leg rather than from the launched token: the token side
// carries no reliable price until long after launch, while this side is always priceable.
// 0x3600..0000 is the 6-decimal ERC-20 view of Arc's native USDC.
const USDC = ADDRESSES.arc.USDC;
const USDC_LOWER = String(USDC).toLowerCase();
// A pair's token0/token1 are immutable, so each pair's USDC side is remembered for the life of
// the process: after the first run only newly registered pairs are read and classified.
const usdcSideCache = new Map<string, 0 | 1 | null>();

const BPS = 10000n;
// WarpDex pools charge a flat 1% swap fee, taken from the input side and split 40% LP / 30%
// creator / 30% protocol (the split and its on-chain check are documented in fees/circlewarp).
// A sell's USDC payout is therefore net of that fee.
const POOL_FEE_BPS = 100n;

const TOKEN_CREATED_EVENT =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string metadataURI)";
// usdcGross is Arc's native 18-decimal USDC (msg.value), not the 6-decimal ERC-20
// facade - booked via addGasToken.
const TRADE_EVENT =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 usdcGross, uint256 tokenAmount, uint256 priceX18, uint256 marketCap)";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)";

/**
 * Volume on the bonding curve: every Trade event's pre-fee gross USDC amount.
 */
async function fetchCurve(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const launches = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: TOKEN_CREATED_EVENT,
    fromBlock: LAUNCH_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const curves = new Set<string>(launches.map((log: any) => String(log.curve).toLowerCase()));
  if (!curves.size) return { dailyVolume };

  // One topic-only query for the window, filtered to our curves here: a `targets` query costs
  // one eth_getLogs per curve, and there are well over a thousand curves.
  const trades = await options.getLogs({ noTarget: true, eventAbi: TRADE_EVENT, onlyArgs: false, allowParseFailure: true });
  for (const log of trades) {
    if (!curves.has(String(log.address).toLowerCase())) continue;
    // usdcGross is the gross value on both sides (verified: matches the pre-fee amount,
    // not net of the 1% curve fee), so no add-back is needed for sells.
    dailyVolume.addGasToken(BigInt(log.args.usdcGross));
  }

  return { dailyVolume };
}

/**
 * Volume on graduated tokens: the USDC side of every WarpDex pool swap.
 */
async function fetchGraduatedPools(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  // Pools are read from the factory's own registry (allPairsLength/allPairs) rather than from
  // a PairCreated log scan. The factory deployed at block 12894992, and scanning 17M blocks
  // for a handful of pools trips the Arc RPC rate limits. The registry also covers pools
  // created before the 2026-09-16 launch, which still trade after it and are skipped by a
  // launch-boundary scan.
  const pairCount = Number(
    await options.api.call({ target: WARPDEX_FACTORY, abi: "uint256:allPairsLength" }),
  );
  if (!pairCount) return { dailyVolume };

  const pairs: string[] = await options.api.multiCall({
    target: WARPDEX_FACTORY,
    abi: "function allPairs(uint256) view returns (address)",
    calls: Array.from({ length: pairCount }, (_, i) => i),
  });

  // Which side of each pool is USDC: 0, 1, or null for a pool not quoted in USDC. Both
  // orientations occur in the deployed pools, so this cannot be assumed per factory.
  const usdcSideOfPair = new Map<string, 0 | 1 | null>(usdcSideCache);
  const unclassified = pairs.filter((pair: string) => !usdcSideCache.has(String(pair).toLowerCase()));
  // Both orientations are read for a pair, in one batched call per slot. Pairs classified by an
  // earlier run in this process are skipped, and an empty batch is never sent.
  if (unclassified.length) {
    const [token0s, token1s]: [string[], string[]] = await Promise.all([
      options.api.multiCall({ abi: "address:token0", calls: unclassified }),
      options.api.multiCall({ abi: "address:token1", calls: unclassified }),
    ]);
    unclassified.forEach((pair: string, i: number) => {
      const key = String(pair).toLowerCase();
      const side =
        String(token0s[i]).toLowerCase() === USDC_LOWER
          ? 0
          : String(token1s[i]).toLowerCase() === USDC_LOWER
            ? 1
            : null;
      usdcSideCache.set(key, side);
      usdcSideOfPair.set(key, side);
    });
  }

  let usdcQuoted = 0;
  for (const pair of pairs) {
    const side = usdcSideOfPair.get(String(pair).toLowerCase());
    if (side === 0 || side === 1) usdcQuoted++;
  }
  // Every graduated token is paired against USDC. If that ever stops being true, the adapter
  // must be taught the new quote asset instead of reporting a silent zero.
  if (!usdcQuoted) {
    throw new Error(
      `dexs/circlewarp: none of the ${pairs.length} WarpDex pairs quote USDC (${USDC}); the quote asset changed, update this adapter`,
    );
  }

  // Logs are matched back to their pool by the emitting address, so the pair order above and
  // each pool's token0/token1 orientation never have to line up with the query result.
  // One topic-only query for the window instead of one eth_getLogs per pool; swaps of other
  // Uniswap V2 forks on Arc share the topic; they are not in usdcSideOfPair and are skipped.
  const swapLogs = await options.getLogs({ noTarget: true, eventAbi: SWAP_EVENT, onlyArgs: false, allowParseFailure: true });
  for (const log of swapLogs) {
    const side = usdcSideOfPair.get(String(log.address).toLowerCase());
    if (side === null || side === undefined) continue;
    const args = log.args ?? log;
    // A normal swap moves one side in and the other out, but a flash swap can carry both an in
    // and an out on the same side. Adding the two would count the same dollars twice, so take
    // the input when there is one. A buy's USDC input is already gross of the fee; a sell's
    // USDC payout is net of the 1% pool fee, and volume is reported gross of fees, so gross
    // that payout back up.
    const amountIn = side === 0 ? BigInt(args.amount0In) : BigInt(args.amount1In);
    const amountOut = side === 0 ? BigInt(args.amount0Out) : BigInt(args.amount1Out);
    const usdcAmount = amountIn || (amountOut * BPS) / (BPS - POOL_FEE_BPS);
    if (usdcAmount > 0n) dailyVolume.add(USDC, usdcAmount);
  }

  return { dailyVolume };
}

/**
 * Curve volume plus graduated-pool volume for the window.
 */
const fetch = async (options: FetchOptions) => {
  const [curve, pools] = await Promise.all([fetchCurve(options), fetchGraduatedPools(options)]);

  const dailyVolume = curve.dailyVolume;
  dailyVolume.addBalances(pools.dailyVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume:
      "USDC value of every buy and sell, in both venues: bonding-curve trades (the Trade event's pre-fee usdcGross) and, for graduated tokens, swaps in their WarpDex pool (the USDC side of the pool's Swap event; a sell's payout is net of the 1% pool fee, so it is grossed back up over that fee).",
  },
};

export default adapter;
