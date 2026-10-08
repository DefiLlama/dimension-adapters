// Derive v3 perpetual markets: open interest
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveOpenInterest } from "../helpers/derive";

const fetch = async () => ({ openInterestAtEnd: await getDeriveOpenInterest("perp") });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.DERIVE_V3], // v3 zkVM exchange, listed as its own chain like the v2 Derive Chain (lyra) it replaces
  runAtCurrTime: true, // Derive only serves current open interest
};

export default adapter;
