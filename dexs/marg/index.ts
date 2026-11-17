import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Marg DEX (marg.lol): concentrated-liquidity AMM on TON. Every pool is quoted in native TON, so the
// volume is the TON side of each swap, summed by the Marg indexer.
// Contract source: https://github.com/imfromthefuture/marg
const API = "https://marg.lol/api/idx/defillama/volume";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const res = await fetchURL(`${API}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("the-open-network", Number(res.volume) / 1e9);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "TON side of every swap on Marg DEX pools.",
  },
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: "2026-11-16",
    },
  },
};

export default adapter;
