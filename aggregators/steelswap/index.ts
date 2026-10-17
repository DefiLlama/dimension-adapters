import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// SteelSwap is a DEX aggregator on Cardano that splits and routes swaps across Cardano DEXs.
// Every swap transaction it builds carries a CIP-20 message (metadata label 674) naming the
// builder: "SteelSwap: <version>", or "CarDeM" for SteelSwap V1. SteelSwap's API sums the swaps
// executed in those transactions per UTC day, and answers 404 for a day it has not stored yet,
// so a missing day throws instead of reading as zero.
const API = "https://api.steelswap.io/api/v2/defillama/aggregators";

const fetch = async (options: FetchOptions) => {
  const res = await httpGet(`${API}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`);
  const raw = res.dailyVolume;
  const volume = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "") ? Number(raw) : NaN;
  if (!Number.isFinite(volume)) throw new Error(`steelswap: no volume in ${JSON.stringify(res)}`);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2023-09-24", // first SteelSwap swap
  methodology: {
    Volume: "USD value of the swaps users executed through SteelSwap, counting each trade's input once at the day's ADA/USD close. Unfilled and cancelled orders are excluded.",
  },
};

export default adapter;
