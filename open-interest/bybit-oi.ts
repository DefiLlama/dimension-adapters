import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchBybit } from "../helpers/cex";

const fetch = async () => {
  const { openInterest } = await fetchBybit();
  return { openInterestAtEnd: openInterest };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
      start: "2020-03-01",
    },
  },
};

export default adapter;
