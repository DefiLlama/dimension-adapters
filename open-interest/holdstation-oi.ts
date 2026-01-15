import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://bnbfutures.holdstation.com/api/trading-pairs/oi/sum";

async function fetch() {
  const data = await fetchURL(API_URL);
  const openInterestAtEnd = Number(data.value);

  return {
    openInterestAtEnd
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2025-09-03",
  runAtCurrTime: true,
};

export default adapter;