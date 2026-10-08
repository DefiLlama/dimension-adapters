import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveOpenInterest } from "../helpers/derive";

const fetch = async () => ({ openInterestAtEnd: await getDeriveOpenInterest("perp") });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.LYRA],
  runAtCurrTime: true, // Derive only serves current open interest
};

export default adapter;
