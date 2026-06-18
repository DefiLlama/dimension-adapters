import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const OVERVIEW_API = "https://www.endbanks.org/api/relay-swaps/overview?timePeriod=all";

interface GraphDataPoint {
  dateFull: string; // e.g. "2025-12-18T00:00:00.000Z"
  total_volume_usd: number;
  is_ongoing: boolean;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const res = await httpGet(OVERVIEW_API);
  const graphData: GraphDataPoint[] = res?.graph_data ?? [];

  const dayItem = graphData.find((point: GraphDataPoint) => options.startOfDay === Math.floor(new Date(point.dateFull).getTime() / 1000))
  if (!dayItem) throw Error(`no data found for day ${options.dateString}`);
  
  dailyVolume.addUSDValue(dayItem.total_volume_usd)

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-12-18',
  methodology: {
    Volume: "Total USD value of Relay swaps routed through Avici, from the endbanks.org overview API.",
  },
};

export default adapter;
