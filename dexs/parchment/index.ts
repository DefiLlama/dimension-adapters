import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PARCHMENT_START, PARCHMENT_USDC, closedNotional, getParchmentEvents, getParchmentMarketFilter, isParchmentExchange } from "../../helpers/parchment";

// Parchment is an oracle-priced perp DEX: every fill is the trader against the house pool, so each open
// and each close is one taker trade (no maker leg to drop).
// Volume is large relative to TVL because markets allow 100x-1000x leverage on small margins (a $10 margin at
// 1000x is a $10k fill) and positions are held for minutes; open interest, not TVL, bounds the risk.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { startTimestamp, endTimestamp } = options;

  // Opens: `notional` is the filled position size in USDC base units (locked margin x leverage). The open event
  // carries `market_id` only, so it is attributed to the Exchange through its market.
  const [isParchmentMarket, allOpens, allCloses] = await Promise.all([
    getParchmentMarketFilter(endTimestamp),
    getParchmentEvents("OpenPositionEventV1", startTimestamp, endTimestamp),
    getParchmentEvents("CloseFeesEventV2", startTimestamp, endTimestamp),
  ]);
  const opens = allOpens.filter(isParchmentMarket);
  for (const open of opens) dailyVolume.add(PARCHMENT_USDC, open.notional);

  // Closes (user, keeper-filled and session force closes; one `CloseFeesEventV2` per settled close). The close
  // event carries no size, so the notional is recovered from the close charge, which is exactly
  // notional * close_fee_ppm / 1e6. Liquidations emit no close event and are not counted as volume.
  const closes = allCloses.filter(isParchmentExchange);
  for (const close of closes) dailyVolume.add(PARCHMENT_USDC, closedNotional(close.close_charge).toString());

  // Every position opened so far was stamped with the 40 ppm close fee the recovery above assumes. Fail loudly
  // if a different rate shows up instead of silently mis-sizing closes. Checking opens is enough: the rate is
  // stamped on the position at open, a position closes after it opens, and every hourly window runs this check,
  // so a new rate fails the window of its first open before any close at that rate can be counted.
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
