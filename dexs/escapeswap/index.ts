import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchEscapeSwap } from "../../fees/escapeswap";
import { SOLANA_START } from "../../fees/escapehub";


const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchEscapeSwap(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: SOLANA_START,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "SOL side of every swap on EscapeSwap pools.",
  },
};

export default adapter;
