import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { fetchBungeeChains, fetchBungeeData } from "../helpers/aggregators/bungee";

const methodology = {
  Fees: 'Total fees paid by users from swap and bridge transactions.',
  Revenue: 'Total fees paid are distributed to Bungee integrations.',
  ProtocolRevenue: 'Total fees paid are collected by Bungee protocol.',
}

const breakdownMethodology = {
  Fees: {
    'Aggregator fees': 'Fees charged by Bungee on swap and bridge transactions routed through Socket Gateway contracts',
  },
  Revenue: {
    'Integration fees': 'Fees distributed to Bungee integration partners (frontends, wallets, dApps) that use Bungee for cross-chain transactions',
  }
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const { dailyFees } = await fetchBungeeData(options, { fees: true })
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyFees, 'Integration fees');
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  fetch,
  start: '2023-08-10',
  chains: fetchBungeeChains()
};

export default adapter;
