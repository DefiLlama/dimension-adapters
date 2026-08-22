import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const OVERVIEW_API = "https://www.endbanks.org/api/relay-swaps/overview?timePeriod=all";
// Source: https://dune.com/queries/7336077/11261155
// Float yield is excluded because the 50% yield share is an estimate and can be wrong.
// Card issuing fees are excluded because there are not enough reliable sources to track them.
const INTERCHANGE_RATE = 0.0125;
const INTERCHANGE_FEES = "Interchange Fees";

interface GraphDataPoint {
  dateFull: string; // e.g. "2025-12-18T00:00:00.000Z"
  total_volume_usd: number;
  is_ongoing: boolean;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const res = await httpGet(OVERVIEW_API);
  const graphData: GraphDataPoint[] = res?.graph_data ?? [];

  const dayItem = graphData.find((point: GraphDataPoint) => options.startOfDay === Math.floor(new Date(point.dateFull).getTime() / 1000))
  if (!dayItem) throw Error(`no data found for day ${options.dateString}`);

  const interchangeFees = dayItem.total_volume_usd * INTERCHANGE_RATE;

  dailyVolume.addUSDValue(dayItem.total_volume_usd)
  dailyFees.addUSDValue(interchangeFees, INTERCHANGE_FEES);
  dailyRevenue.addUSDValue(interchangeFees, INTERCHANGE_FEES);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Volume: "Total USD value of Relay swaps routed through Avici, sourced from the endbanks.org overview API.",
  Fees: "Includes interchange fees, calculated as 1.25% of Avici card spend.",
  Revenue: "Revenue is the full interchange amount retained by Avici.",
  ProtocolRevenue: "Protocol revenue is the full interchange amount retained by Avici.",
};

const breakdownMethodology = {
  Fees: {
    [INTERCHANGE_FEES]: "Interchange fees calculated as 1.25% of Avici card spend.",
  },
  Revenue: {
    [INTERCHANGE_FEES]: "Interchange fees retained by Avici.",
  },
  ProtocolRevenue: {
    [INTERCHANGE_FEES]: "Interchange fees retained by Avici.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-12-18',
  methodology,
  breakdownMethodology,
};

export default adapter;
