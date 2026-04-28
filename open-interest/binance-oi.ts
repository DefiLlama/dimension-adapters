import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBinance } from "../helpers/cex";

const fetch = async () => {
  const { openInterest } = await fetchBinance();
  return { openInterestAtEnd: openInterest };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
      start: "2019-09-13",
    },
  },
};

export default adapter;
