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

  // Volume = Fees / 0.01 = Fees * 100 (since fees are 1% of volume)
  const dailyVolume = dailyFees.clone(100);

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume:
    "Trading volume is calculated from the 1% trading fees collected in WBNB. Volume = Fees / 0.01 = Fees * 100.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2024-07-01",
  methodology,
};

export default adapter;
