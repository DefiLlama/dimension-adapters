import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const BASE_URL = "https://cdn.routescan.io/api/evm/all/aggregations";
const CHAIN_ID = 1088;

type RouteScanRow = [string, string];

const fetch = async (options: FetchOptions) => {
  const [txs, addresses] = await Promise.all([
    fetchURL(`${BASE_URL}/txs?includedChainIds=${CHAIN_ID}&unit=day`),
    fetchURL(`${BASE_URL}/addresses?includedChainIds=${CHAIN_ID}&unit=day`),
  ]);

  const txsEntry = (txs as RouteScanRow[]).find(([timestamp]) => timestamp.startsWith(options.dateString));
  const addressesEntry = (addresses as RouteScanRow[]).find(([timestamp]) => timestamp.startsWith(options.dateString));

  return {
    dailyActiveUsers: Number(addressesEntry?.[1]),
    dailyTransactionsCount: Number(txsEntry?.[1]),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.METIS],
  protocolType: ProtocolType.CHAIN,
  start: "2021-11-18",
};

export default adapter;
