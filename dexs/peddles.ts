import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { PEDDLES, POOL_REGISTERED, PeddlesPool } from "../helpers/peddles";

// Peddles: a token launchpad on Uniswap v4. Volume is the quote side of every swap on a pool that
// PeddlesFeeHook registered: ETH, or the tokenised stock the launch is paired against.
//
// The pools sit on the canonical Uniswap v4 PoolManager and their positions are minted through
// Uniswap's PositionManager, so dexs/uniswap-v4 can count the same swaps: hence doublecounted.
//
// Pools are identified by the hook's own PoolRegistered event, never by their quote token. All
// PoolManager swaps are pulled from the indexer and filtered to the registered pool ids client
// side (the indexer does not support an OR list in topic1).

const SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

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
    // v4 orders a pool's two currencies by address, so this is the slot the PoolManager filled.
    pools.set(String(log.poolId).toLowerCase(), { quote, quoteIsCurrency0: BigInt(quote) < BigInt(token) });
  }
  if (!pools.size) return { dailyVolume };

  const swaps = await options.getLogs({ target: deployment.poolManager, eventAbi: SWAP });
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
    Volume: "Swap volume on the pools of tokens launched on Peddles, counted once per trade on the side the token is paired against: ETH or a tokenised stock.",
  },
};

export default adapter;
