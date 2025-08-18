import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../helpers/aggregators/bungee";

const methodology = {
  Fees: 'Total fees paid by users from swap and bridge transactions.',
  Revenue: 'Total fees paid are distributed to Bungee integrations.',
  ProtocolRevenue: 'Total fees paid are collected by Bungee protocol.',
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const { dailyFees } = await fetchBungeeData(options, { fees: true })
  return { 
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  start: '2023-08-10',
  chains: fetchBungeeChains()
};

export default adapter;
