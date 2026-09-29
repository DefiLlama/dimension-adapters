import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { PEDDLES, POOL_REGISTERED, PeddlesPool } from "../helpers/peddles";

// Peddles: a token launchpad on Uniswap v4. Volume is the quote side of every swap on a pool that
// PeddlesFeeHook registered: ETH, or the tokenised stock the launch is paired against.
//
// The pools sit on the canonical Uniswap v4 PoolManager and their positions are minted through
// Uniswap's PositionManager, so dexs/uniswap-v4 can count the same swaps: hence doublecounted.
//
// Pools are identified by the hook's own PoolRegistered event, never by their quote token. Swaps
// are read from the PoolManager with topic1 OR'd across the registered pool ids, so the rest of
// the chain's v4 traffic is not pulled in.

const SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"; // v4 Swap topic0

// Pool ids per getLogs call. One launch is one pool, so the list only grows.
const POOL_IDS_PER_CALL = 500;

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

  const ids = [...pools.keys()];
  for (let i = 0; i < ids.length; i += POOL_IDS_PER_CALL) {
    const swaps = await options.getLogs({
      target: deployment.poolManager,
      eventAbi: SWAP,
      topics: [SWAP_TOPIC, ids.slice(i, i + POOL_IDS_PER_CALL)] as any,
    });
    for (const log of swaps) {
      const pool = pools.get(String(log.id).toLowerCase());
      if (!pool) continue;
      const amount = BigInt(pool.quoteIsCurrency0 ? log.amount0 : log.amount1);
      dailyVolume.add(pool.quote, amount < 0n ? -amount : amount);
    }
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
