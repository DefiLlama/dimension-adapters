import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOkx } from "../helpers/cex";

const fetch = async () => {
  const { openInterest } = await fetchOkx();
  return { openInterestAtEnd: openInterest };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
      start: "2020-01-01",
    },
  },
};

export default adapter;
