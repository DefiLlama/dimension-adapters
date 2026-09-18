import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, FACTORY, FACTORY_START_BLOCK, MEME_HOOK, POOL_MANAGER, START, USDC, fociPoolId, scanLogs } from "../../fees/foci/config";

// keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

/**
 * Volume is the USDC side of every trade against a Foci launch: bonding-curve buys (`quoteIn`,
 * gross of the fee) and sells (`quoteOut`, net to the seller) while the token is on its curve, and
 * the USDC leg of every Uniswap V4 swap in a Foci pool after graduation. Foci pools are derived
 * from the factory's launch records (pool id = keccak of the sorted pool key with the Foci hook), so
 * a PoolManager swap on any other pool is ignored. Memecoin legs are never counted.
 */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  // The one historical scan: launches are event-only on the factory (no enumeration view).
  const launches = await scanLogs({ chain, target: FACTORY, eventAbi: ABI.tokenLaunched, fromBlock: FACTORY_START_BLOCK, toBlock, cacheInCloud: true });
  const usdcLaunches = launches.filter((l: any) => String(l.pairToken).toLowerCase() === USDC);
  const curves: string[] = usdcLaunches.map((l: any) => l.curve);
  const tokens: string[] = usdcLaunches.map((l: any) => l.token);
  if (!tokens.length) return { dailyVolume };

  const buys = await scanLogs({ chain, targets: curves, eventAbi: ABI.curveBuy, fromBlock, toBlock });
  for (const b of buys) dailyVolume.add(USDC, b.quoteIn);
  const sells = await scanLogs({ chain, targets: curves, eventAbi: ABI.curveSell, fromBlock, toBlock });
  for (const s of sells) dailyVolume.add(USDC, s.quoteOut);

  // Graduated pools (phase 2 = PoolCreated), one paced query each on the indexed pool id: the shared
  // PoolManager emits far more swaps per day than an RPC returns in one range.
  const infos = await options.api.multiCall({ abi: ABI.getLaunchedToken, target: FACTORY, calls: tokens, permitFailure: true });
  for (let i = 0; i < tokens.length; i++) {
    const info = infos[i];
    if (!info || +info.phase !== 2) continue;
    const { poolId, quoteIsCurrency0 } = fociPoolId(tokens[i], USDC, Number(info.tickSpacing), MEME_HOOK);
    const swaps = await scanLogs({ chain, target: POOL_MANAGER, eventAbi: ABI.swap, topics: [SWAP_TOPIC, poolId], fromBlock, toBlock });
    for (const s of swaps) {
      const amount = BigInt(quoteIsCurrency0 ? s.amount0 : s.amount1);
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
    Volume: "USDC traded against Foci launches: bonding-curve buys (gross of fee) and sells (net to seller), plus the USDC leg of Uniswap V4 swaps in Foci pools after graduation. Memecoin legs are not counted.",
  },
};

export default adapter;
