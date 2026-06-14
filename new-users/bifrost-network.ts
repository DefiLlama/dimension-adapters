import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_API = "https://explorer-stats.mainnet.thebifrost.io";

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;
  const { chart } = await fetchURL(`${STATS_API}/api/v1/lines/newAccounts?from=${date}&to=${date}&resolution=DAY`);
  const entry = chart?.find((item: any) => item.date === date);
  if (!entry) throw new Error(`Bifrost Network: no newAccounts data for ${date}`);
  return { dailyNewUsers: Number(entry.value) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BFC],
  protocolType: ProtocolType.CHAIN,
  start: "2023-01-17",
};

export default adapter;
