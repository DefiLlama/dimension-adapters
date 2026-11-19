import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { PARCHMENT_START, PARCHMENT_USDC, getParchmentCloses, getParchmentEvents, getParchmentMarketFilter } from "../../helpers/parchment";

// Parchment is an oracle-priced perp DEX: every fill is the trader against the house pool, so each open
// and each close is one taker trade (no maker leg to drop).
// Volume is large relative to TVL because markets allow 100x-1000x leverage on small margins (a $10 margin at
// 1000x is a $10k fill) and positions are held for minutes; open interest, not TVL, bounds the risk.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { startTimestamp, endTimestamp } = options;

  // Opens: `notional` is the filled position size in USDC base units (locked margin x leverage). The open event
  // carries `market_id` only, so it is attributed to the Exchange through its market.
  const [isParchmentMarket, opens, closes] = await Promise.all([
    getParchmentMarketFilter(endTimestamp),
    getParchmentEvents("OpenPositionEventV1", startTimestamp, endTimestamp),
    // Closes (user, keeper-filled and session force closes, full or partial) with their closed notional, read from the
    // position's on-chain state before and after the close transaction and checked against the close charge (see
    // `getParchmentCloses`); no close fee rate is assumed. Liquidations emit no close event and are not counted.
    getParchmentCloses(startTimestamp, endTimestamp),
  ]);
  for (const open of opens.filter(isParchmentMarket)) dailyVolume.add(PARCHMENT_USDC, open.notional);
  for (const { notional } of closes) dailyVolume.add(PARCHMENT_USDC, notional.toString());

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: PARCHMENT_START,
  methodology: {
    Volume: "USD notional of every perpetual position opened and closed on Parchment (each fill is the trader against the house pool, counted once). Open size is read from the open event; close size is the drop in the position's on-chain notional across the close transaction (the whole position for a full close, the slice for a partial close). Liquidations are excluded.",
  },
};

export default adapter;
