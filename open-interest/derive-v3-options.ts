import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveOpenInterest } from "../helpers/derive";

const fetch = async () => ({ openInterestAtEnd: await getDeriveOpenInterest("option") });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.DERIVE_V3],
  runAtCurrTime: true, // Derive only serves current open interest
  methodology: {
    OpenInterest: "Notional open interest of all Derive options markets, one side counted, in underlying units times the current spot price. Not adjusted for expiry, strike or premium paid.",
  },
};

export default adapter;
