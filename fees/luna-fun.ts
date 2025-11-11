import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const TAX_MANAGER = "0x061aD83969a6F9864f02265FB1ff103DDBCA5cDB";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: [WBNB],             // Track WBNB inflows (1% trading fees)
    targets: [TAX_MANAGER],     // Fee receiver
  });


  const dailyRevenue = dailyFees.clone(0.45);
  // Note: 5% creator revenue is not tracked as a separate metric (not supported)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,      // Luna Treasury
  };
};

const methodology = {
  Fees:
    "Every trade incurs a 1% fee collected in WBNB and sent to the TaxManager.",
  Revenue:
    "45% of fees (WBNB inflows) are distributed to the Luna Treasury as protocol revenue.",
  CreatorRevenue: "5% of fees are distributed to the meme coin creator.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2024-07-01",
  methodology,
};

export default adapter;
