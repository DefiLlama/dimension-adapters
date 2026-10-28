import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Alcor Exchange: concentrated liquidity AMM (swap.alcor) and an orderbook DEX on
// each Antelope chain. Alcor's indexer aggregates both into hourly buckets, each
// trade valued in USD through the pool's priced side; the endpoint sums the
// buckets of any [start_time, end_time) window.
// Hourly history is available from 2023-06-29 on every chain.
const chainConfig: Record<string, { api: string; start: string }> = {
  [CHAIN.WAX]: { api: "https://wax.alcor.exchange", start: "2023-06-29" },
  [CHAIN.PROTON]: { api: "https://proton.alcor.exchange", start: "2023-06-29" },
  [CHAIN.EOS]: { api: "https://eos.alcor.exchange", start: "2023-06-29" },
  [CHAIN.TELOS]: { api: "https://telos.alcor.exchange", start: "2023-06-29" },
};

interface IVolume {
  swapVolume: number;
  spotVolume: number;
}

const fetch = async (options: FetchOptions) => {
  const { api } = chainConfig[options.chain];
  const url = `${api}/api/v2/analytics/volume?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}`;
  const { swapVolume, spotVolume }: IVolume = await fetchURL(url);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(swapVolume, "AMM Swaps");
  dailyVolume.addUSDValue(spotVolume, "Orderbook Trades");

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "USD value of swaps on Alcor's concentrated liquidity pools plus trades matched on its orderbook.",
  },
  breakdownMethodology: {
    Volume: {
      "AMM Swaps": "Swaps routed through the swap.alcor concentrated liquidity pools.",
      "Orderbook Trades": "Orders matched on the Alcor orderbook contract.",
    },
  },
};

export default adapter;
