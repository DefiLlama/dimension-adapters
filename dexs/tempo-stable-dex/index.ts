import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Tempo Stablecoin DEX — daily spot volume.
 *
 * The Stablecoin DEX is a precompile predeployed at a fixed address on every
 * Tempo node (chainId 4217). It is a true on-chain CLOB (Central Limit Order
 * Book): users place price-tick-bound limit orders against base/quote pairs,
 * and matching is price-time priority, not constant-product.
 *
 *   Source:    https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/stablecoin_dex
 *   Spec:      https://docs.tempo.xyz/protocol/exchange
 *   Predeploy: https://docs.tempo.xyz/quickstart/predeployed-contracts
 *
 * Event model:
 *
 *   event OrderPlaced(uint128 indexed orderId, address indexed maker,
 *                     address indexed token, uint128 amount, bool isBid,
 *                     int16 tick, bool isFlipOrder, int16 flipTick);
 *
 *   event OrderFilled(uint128 indexed orderId, address indexed maker,
 *                     address indexed taker, uint128 amountFilled,
 *                     bool partialFill);
 *
 * OrderFilled only carries the orderId — the base token and price-tick live
 * in OrderPlaced, which can fire any time before the fill. A same-window
 * log scan therefore misses fills against earlier-placed orders. We resolve
 * that by caching OrderPlaced from chain genesis (`fromBlock: 1`,
 * `cacheInCloud: true`) so the historical scan is paid once and subsequent
 * runs only fetch the delta. Each fill's `amountFilled` (base-token units)
 * is then added to the balances bag keyed by base token, and DefiLlama's
 * pricing layer resolves USD.
 *
 * Because `orderId` is monotonically incrementing (`next_order_id` in the
 * precompile, never reused) and OrderPlaced is fired exactly once per order,
 * the lookup is unambiguous. Cancelled orders never fill, so OrderCancelled
 * is not consulted.
 *
 * `maxBlockRange: 99_000` keeps each eth_getLogs call under Tempo's 100k-block
 * RPC limit; without it, Tempo's RPC rejects single-shot 24-hour spans
 * (~170k blocks at ~0.5s block time).
 *
 * The CLOB has no protocol fee (orderbook.rs has no fee escrow), so this
 * adapter reports volume only; cross-stable swap fees route through the
 * separate Fee AMM precompile already covered by `fees/tempo-fee-amm.ts`.
 */

const STABLECOIN_DEX = "0xdec0000000000000000000000000000000000000";

const eventOrderPlaced =
  "event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)";

const eventOrderFilled =
  "event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)";

type OrderMeta = { token: string };

const methodology = {
  Volume:
    "Sum of OrderFilled.amountFilled emitted by Tempo's Stablecoin DEX precompile (0xdec0…0000) over the day, denominated in each fill's base-token units. The base token is recovered by joining each OrderFilled.orderId to the OrderPlaced event that introduced the order — OrderFilled itself is sparse and does not carry the token address. OrderPlaced is fetched from chain genesis with cloud caching, so the join covers fills against orders placed any time prior to the window. Fills against orders we cannot resolve (none expected in steady state) are dropped rather than mis-priced.",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  // Build orderId → token from every OrderPlaced ever emitted.
  // cacheInCloud keeps the historical scan cheap on subsequent runs.
  // fromBlock: 1 because block 0 is genesis (no logs) and SDK rejects
  // fromBlock=0 as falsy. maxBlockRange caps each request at 99k blocks,
  // under Tempo's 100k-block eth_getLogs limit.
  const placedLogs = await options.getLogs({
    target: STABLECOIN_DEX,
    eventAbi: eventOrderPlaced,
    fromBlock: 1,
    cacheInCloud: true,
    skipIndexer: true,
    ...({ maxBlockRange: 99_000 } as any),
  });

  const orderMap = new Map<string, OrderMeta>();
  for (const log of placedLogs) {
    orderMap.set(String(log.orderId), {
      token: String(log.token).toLowerCase(),
    });
  }

  // Daily fills, scoped to the window provided by the cron.
  const fillLogs = await options.getLogs({
    target: STABLECOIN_DEX,
    eventAbi: eventOrderFilled,
    skipIndexer: true,
    ...({ maxBlockRange: 99_000 } as any),
  });

  for (const fill of fillLogs) {
    const meta = orderMap.get(String(fill.orderId));
    if (!meta) continue; // unmappable — order placed before our cache window

    // amountFilled is in base-token smallest units (6 decimals for every TIP-20
    // stablecoin Tempo currently lists). Adding by token lets DefiLlama's
    // pricing layer resolve to USD per registered stablecoin price.
    dailyVolume.add(meta.token, BigInt(fill.amountFilled));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.TEMPO]: {
      fetch,
      start: "2026-03-18", // Tempo Mainnet "Presto" launch (chainId 4217)
    },
  },
};

export default adapter;
