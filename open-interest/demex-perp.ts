import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoint = "https://api.carbon.network/carbon/marketstats/v1/stats";

interface IMarketStat {
  market_type: string;
  open_interest: string;
  mark_price: string;
}

const fetch = async () => {
  const { marketstats } = await fetchURL(endpoint);

  const openInterestAtEnd =
    marketstats
      .filter((e: IMarketStat) => e.market_type === "futures")
      .reduce((a: number, b: IMarketStat) => a + (Number(b.open_interest) * Number(b.mark_price)), 0) / 1e18;

  if (!openInterestAtEnd) throw new Error("No open interest data found");

  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.CARBON],
};

export default adapter;
