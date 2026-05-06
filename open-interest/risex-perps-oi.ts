import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Source: Rise Trade markets endpoint. OI is reported in base units and priced with mark price.
const MARKETS_API = "https://api.rise.trade/v1/markets";

type Market = {
  available?: boolean;
  visible?: boolean;
  open_interest?: string;
  mark_price?: string;
  index_price?: string;
  last_price?: string;
};

const fetch = async () => {
  const response = await httpGet(MARKETS_API);
  const markets: Market[] = response.data?.markets ?? [];
  if (!markets.length) {
    throw new Error("RiseX markets data missing");
  }

  const openInterestAtEnd = markets.reduce((total: number, market: Market, i: number) => {
    if (market.available === false || market.visible === false) return total;

    const rawOpenInterest = market.open_interest;
    const rawPrice = market.mark_price ?? market.index_price ?? market.last_price;
    const openInterest = Number(rawOpenInterest);
    const price = Number(rawPrice);
    if (!Number.isFinite(openInterest) || !Number.isFinite(price) || openInterest < 0 || price < 0) {
      throw new Error(`RiseX market numeric data invalid at index ${i}`);
    }

    return total + openInterest * price;
  }, 0);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  start: "2026-04-01",
};

export default adapter;
