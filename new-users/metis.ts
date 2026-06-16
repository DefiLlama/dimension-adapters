import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const UNIQUE_ADDRESSES_URL = "https://cdn.routescan.io/api/evm/all/aggregations/unique-addresses?includedChainIds=1088&unit=day";

type RouteScanRow = [string, string];

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(UNIQUE_ADDRESSES_URL);
  const rows = data as RouteScanRow[];
  const previousDate = new Date((options.startOfDay - 86400) * 1000).toISOString().slice(0, 10);
  const currentEntry = rows.find(([timestamp]) => timestamp.startsWith(options.dateString));
  const previousEntry = rows.find(([timestamp]) => timestamp.startsWith(previousDate));
  const dailyNewUsers = Number(currentEntry?.[1]) - Number(previousEntry?.[1]);

  return { dailyNewUsers };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.METIS],
  protocolType: ProtocolType.CHAIN,
  start: "2021-11-19",
};

export default adapter;
