import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveOpenInterest } from "../helpers/derive";

const fetch = async () => ({ openInterestAtEnd: await getDeriveOpenInterest("perp") });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.DERIVE_V3],
  runAtCurrTime: true, // Derive only serves current open interest
  methodology: {
    OpenInterest: "Open interest of Derive perpetual markets, one side counted.",
  },
};

export default adapter;
