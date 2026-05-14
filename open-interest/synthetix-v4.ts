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
  const openInterestAtEnd = options.createBalances();
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  const marketPrices = await post({ action: "getMarketPrices" });
  const openInterest = await post({ action: "getOpenInterest" });

  openInterest.forEach(({ symbol, longOpenInterest, shortOpenInterest }: any) => {
    const price = marketPrices[symbol];
    if (!price) throw new Error(`Missing Synthetix mark price for ${symbol} open interest`);

    const markPrice = Number(price.markPrice || 0);
    const longOpenInterestUsd = Number(longOpenInterest || 0) * markPrice;
    const shortOpenInterestUsd = Number(shortOpenInterest || 0) * markPrice;

    openInterestAtEnd.addUSDValue(longOpenInterestUsd + shortOpenInterestUsd);
    longOpenInterestAtEnd.addUSDValue(longOpenInterestUsd);
    shortOpenInterestAtEnd.addUSDValue(shortOpenInterestUsd);
  });

  return {
    openInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter = {
  version: 2,
  runAtCurrTime: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
};

export default adapter;
