import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PARCHMENT_START, PARCHMENT_USDC, assertParchmentCloseFeePpm, closedNotional, getParchmentEvents, getParchmentMarkets, isParchmentExchange, parchmentMarketFilter } from "../../helpers/parchment";

// Parchment is an oracle-priced perp DEX: every fill is the trader against the house pool, so each open
// and each close is one taker trade (no maker leg to drop).
// Volume is large relative to TVL because markets allow 100x-1000x leverage on small margins (a $10 margin at
// 1000x is a $10k fill) and positions are held for minutes; open interest, not TVL, bounds the risk.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { startTimestamp, endTimestamp } = options;

  // Opens: `notional` is the filled position size in USDC base units (locked margin x leverage). The open event
  // carries `market_id` only, so it is attributed to the Exchange through its market.
  const [markets, allOpens, allCloses] = await Promise.all([
    getParchmentMarkets(endTimestamp),
    getParchmentEvents("OpenPositionEventV1", startTimestamp, endTimestamp),
    getParchmentEvents("CloseFeesEventV2", startTimestamp, endTimestamp),
  ]);
  const opens = allOpens.filter(parchmentMarketFilter(markets));
  for (const open of opens) dailyVolume.add(PARCHMENT_USDC, open.notional);

  // Closes (user, keeper-filled and session force closes; one `CloseFeesEventV2` per settled close). The close
  // event carries no size, so the notional is recovered from the close charge, which is exactly
  // notional * close_fee_ppm / 1e6. Liquidations emit no close event and are not counted as volume.
  const closes = allCloses.filter(isParchmentExchange);
  for (const close of closes) dailyVolume.add(PARCHMENT_USDC, closedNotional(close.close_charge).toString());

  // The close notional recovery assumes every closed position was stamped with the 40 ppm close fee. The rate is
  // per market and admin-settable (`market::set_depth`), and the close event carries neither size nor rate, so two
  // guards fail the run instead of mis-sizing closes:
  // - every market's current `impact.close_fee_ppm` (read at run time) is 40, so every run fails while any market
  //   has another rate, whether or not a position has opened at it yet;
  // - every open in this window was stamped with 40, so the window of an open at another rate fails.
  // Not covered: a rate set to another value and back to 40 while positions opened at it stay open. Their open
  // windows fail, but later windows pass both guards and mis-size those positions' closes. Catching that would
  // mean scanning every open since launch on each run.
  assertParchmentCloseFeePpm(markets);
  for (const open of opens)
    if (String(open.close_fee_ppm) !== "40") throw new Error(`Parchment: unexpected close_fee_ppm ${open.close_fee_ppm} on position ${open.position_id}`);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: PARCHMENT_START,
  methodology: {
    Volume: "USD notional of every perpetual position opened and closed on Parchment (each fill is the trader against the house pool, counted once). Liquidations are excluded.",
  },
};

export default adapter;
