import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, FACTORY, FACTORY_START_BLOCK, MEME_HOOK, POOL_MANAGER, START, USDC } from "../../fees/foci/config";

/**
 * Volume is the USDC side of every trade against a Foci launch: bonding-curve buys (`quoteIn`,
 * gross of the fee) and sells (`quoteOut`, net to the seller) while the token is on its curve, and
 * the USDC leg of every Uniswap V4 swap in a Foci pool after graduation. Foci pools are the ones the
 * hook registered; a PoolManager swap on any other pool is ignored. Memecoin legs are never counted.
 */
// keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const toBlock = await options.getToBlock();

  const launches = await options.getLogs({
    target: FACTORY, eventAbi: ABI.tokenLaunched, onlyArgs: true, fromBlock: FACTORY_START_BLOCK, toBlock, cacheInCloud: true,
  });
  const curves: string[] = launches.filter((l: any) => String(l.pairToken).toLowerCase() === USDC).map((l: any) => l.curve);

  if (curves.length) {
    const buys = await options.getLogs({ targets: curves, eventAbi: ABI.curveBuy, onlyArgs: true, flatten: true });
    for (const b of buys) dailyVolume.add(USDC, b.quoteIn);
    const sells = await options.getLogs({ targets: curves, eventAbi: ABI.curveSell, onlyArgs: true, flatten: true });
    for (const s of sells) dailyVolume.add(USDC, s.quoteOut);
  }

  // Graduated pools: the hook registered each one; the quote leg is currency0 or currency1
  // depending on how the memecoin address sorts against USDC (~1 in 5 sort below it).
  const registered = await options.getLogs({
    target: MEME_HOOK, eventAbi: ABI.poolRegistered, onlyArgs: true, fromBlock: FACTORY_START_BLOCK, toBlock, cacheInCloud: true,
  });
  const quoteIsCurrency0 = new Map<string, boolean>();
  for (const p of registered) {
    if (String(p.quoteToken).toLowerCase() !== USDC) continue;
    quoteIsCurrency0.set(String(p.poolId).toLowerCase(), BigInt(p.quoteToken) < BigInt(p.memecoin));
  }
  // One query per Foci pool, filtered on the indexed poolId: the shared PoolManager emits far more
  // swaps per day than an RPC will return in one unfiltered range (Arc RPCs cap at 20k results).
  for (const [poolId, side] of quoteIsCurrency0) {
    const swaps = await options.getLogs({
      target: POOL_MANAGER, eventAbi: ABI.swap, onlyArgs: true, topics: [SWAP_TOPIC, poolId],
    });
    for (const s of swaps) {
      const amount = BigInt(side ? s.amount0 : s.amount1);
      dailyVolume.add(USDC, amount < 0n ? -amount : amount);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: START,
  methodology: {
    Volume: "USDC traded against Foci launches: bonding-curve buys (gross of fee) and sells (net to seller), plus the USDC leg of Uniswap V4 swaps in Foci-registered pools after graduation. Memecoin legs are not counted.",
  },
};

export default adapter;
