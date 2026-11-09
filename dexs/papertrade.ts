import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getOpenInterestAtEnd, getProtocolWindowDeltas } from "../helpers/papertrade";

const fetch = async (options: FetchOptions) => {
  // Volume is not listed for now: 1000x synthetic bets produce hundreds of billions of notional a day on ~$100M TVL,
  // which is not comparable with order-book perp venues. Fees stay listed in fees/papertrade.ts.
  throw new Error("papertrade: volume and open interest intentionally not published yet");
  // `volume` counts the open leg and the outcome leg (close or liquidation) of every position; `liquidation` is the
  // stats page's "cumulative liquidated notional". Liquidations are not perp volume, so only opens and closes remain.
  const { volume, liquidation } = await getProtocolWindowDeltas(options, ["volume", "liquidation"]);
  if (liquidation > volume) throw new Error(`papertrade: liquidated notional ${liquidation} exceeds volume ${volume} for ${options.dateString}`);
  const openInterest = await getOpenInterestAtEnd(options);
  return { dailyVolume: volume - liquidation, ...openInterest };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN], // synthetic bets against the house, no real perp trades on Hyperliquid
  start: "2026-10-10", // public launch
  methodology: {
    Volume: "Notional (margin times leverage) of BTC and ETH positions opened and voluntarily closed on Papertrade, in USD; liquidations are excluded. Every trade is against the protocol-owned LP at Hyperliquid's mid price, so there is no maker side and no Hyperliquid order-book volume is included.",
    OpenInterest: "Entry notional of all open BTC and ETH positions at the end of the period, long and short sides added together because each side is separate exposure against the protocol LP.",
  },
};

export default adapter;
