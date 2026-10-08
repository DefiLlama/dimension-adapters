// Derive v3 perpetual markets: open interest
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveOpenInterest } from "../helpers/derive";

const fetch = async () => ({ openInterestAtEnd: await getDeriveOpenInterest("perp") });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM], // v3 custody and settlement proofs live on Ethereum mainnet, Derive Chain is being wound down
  runAtCurrTime: true, // Derive only serves current open interest
};

export default adapter;
