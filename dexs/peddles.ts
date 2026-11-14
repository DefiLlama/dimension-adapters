import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { PEDDLES, POOL_REGISTERED, PeddlesPool, SWAP_EVENTS } from "../helpers/peddles";

// Peddles: a token launchpad on Uniswap v4. Volume is the quote side of every swap on a pool that
// PeddlesFeeHook registered: ETH, BNB, USDC, DAI, or the tokenised stock the launch is paired against.
//
// The pools sit on the canonical Uniswap v4 PoolManager and their positions are minted through
// Uniswap's PositionManager, so dexs/uniswap-v4 can count the same swaps: hence doublecounted.
// On Anubis the pools sit on Gully Core's CLPoolManager (a PancakeSwap Infinity fork), whose Swap
// event has one more field; the hook there emits the same PoolRegistered.
//
// Pools are identified by the hook's own PoolRegistered event, never by their quote token. All
// PoolManager swaps are pulled from the indexer and filtered to the registered pool ids client
// side (the indexer does not support an OR list in topic1).

const fetch = async (options: FetchOptions) => {
  const deployment = PEDDLES[options.chain];
  const dailyVolume = options.createBalances();

  // From the hook's first block, not the window: a pool launched earlier still trades today.
  const registered = await options.getLogs({
    target: deployment.feeHook,
    eventAbi: POOL_REGISTERED,
    fromBlock: deployment.fromBlock,
    cacheInCloud: true,
  });

  const pools = new Map<string, PeddlesPool>();
  for (const log of registered) {
    const token = String(log.token).toLowerCase();
    const quote = String(log.quote).toLowerCase();
    // v4 and Infinity both order a pool's two currencies by address, so this is the slot the PoolManager filled.
    pools.set(String(log.poolId).toLowerCase(), { quote, quoteIsCurrency0: BigInt(quote) < BigInt(token) });
  }
  if (!pools.size) return { dailyVolume };

  const swaps = await options.getLogs({ target: deployment.poolManager, eventAbi: SWAP_EVENTS[deployment.venue ?? "uniswap-v4"] });
  for (const log of swaps) {
    const pool = pools.get(String(log.id).toLowerCase());
    if (!pool) continue;
    const amount = BigInt(pool.quoteIsCurrency0 ? log.amount0 : log.amount1);
    dailyVolume.add(pool.quote, amount < 0n ? -amount : amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  fetch,
  adapter: PEDDLES,
  methodology: {
    Volume: "Swap volume on the pools of tokens launched on Peddles, counted once per trade on the side the token is paired against: ETH, BNB, USDC, DAI or a tokenised stock.",
  },
};

export default adapter;
