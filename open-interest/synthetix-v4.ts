import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const API = "https://papi.synthetix.io/v1/info";
const retries = 3;
const headers = { "User-Agent": "defillama-dimension-adapters/1.0" };

const post = async (params: any) => {
  const res = await postURL(API, { params }, retries, { headers });
  if (res.status !== "ok" || res.response === undefined) throw new Error(`Synthetix API error: ${params.action}`);
  return res.response;
};

const fetch = async (options: any) => {
  // long == short exactly on every market, so one side is the one-sided total and a
  // long/short split would report it twice.
  const openInterestAtEnd = options.createBalances();
  const marketPrices = await post({ action: "getMarketPrices" });
  const openInterest = await post({ action: "getOpenInterest" });

  openInterest.forEach(({ symbol, longOpenInterest, shortOpenInterest }: any) => {
    const price = marketPrices[symbol];
    if (!price || !price.markPrice || !longOpenInterest || !shortOpenInterest) {
      throw new Error(`Missing Synthetix mark price or open interest for ${symbol}`);
    }
    openInterestAtEnd.addUSDValue(Number(price.markPrice) * Number(longOpenInterest));
  });

  return { openInterestAtEnd };
};

const adapter = {
  version: 2,
  runAtCurrTime: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
};

export default adapter;
