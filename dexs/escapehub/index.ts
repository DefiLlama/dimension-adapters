import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { chainConfig, fetchEscapeHub } from "../../fees/escapehub";


const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchEscapeHub(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  // own entries, not the fees adapter's: setModuleDefaults writes each adapter's fetch into its chain entries
  adapter: Object.fromEntries(Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }])),
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "SOL / ETH side of every buy and sell on EscapeHub bonding curves, fees included. Trades after graduation are not included.",
  },
};

export default adapter;
