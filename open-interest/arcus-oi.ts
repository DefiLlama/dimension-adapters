import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API = "https://api.arcus.xyz/v1/markets";

const fetch = async () => {
  const { markets } = await fetchURL(API);
  const openInterestAtEnd = markets
    .filter((market: any) => market.type === "PERPETUAL")
    .reduce((sum: number, market: any) => sum + Number(market.openInterest) * Number(market.markPrice), 0);

  // /v1/markets openInterest is one-sided
  return { openInterestAtEnd };
};

const methodology = {
  OpenInterest: "Open interest is the sum of notional open interest (openInterest x markPrice) from Arcus's markets API, which reports one side of each position.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-03",
  runAtCurrTime: true,
  methodology,
};

export default adapter;
