import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Hgraph's GraphQL API powers HashScan's mainnet ecosystem metrics
const HGRAPH_GRAPHQL_URL = "https://mainnet.hedera.api.hgraph.dev/v1/graphql";

const fetch = async (options: FetchOptions) => {
  const startDate = `${options.dateString}T00:00:00`;
  const endDate = new Date(options.toTimestamp * 1e3).toISOString();
  const query = `{
    activeAccounts: ecosystem_metric(
      where: { name: { _eq: "active_accounts" }, period: { _eq: "day" }, start_date: { _eq: "${startDate}" } }
      limit: 1
    ) { total }
    transactions: ecosystem_metric(
      where: { name: { _eq: "new_transactions" }, period: { _eq: "day" }, start_date: { _eq: "${startDate}" } }
      limit: 1
    ) { total }
    networkFees: ecosystem_metric(
      where: { name: { _eq: "network_fee" }, period: { _eq: "hour" }, start_date: { _gte: "${startDate}" }, end_date: { _lte: "${endDate}" } }
      order_by: { end_date: asc }
    ) { total }
  }`;
  const { data } = await postURL(HGRAPH_GRAPHQL_URL, { query }, 3, {
    headers: { "X-API-KEY": process.env.HGRAPH_API_KEY },
  });

  const activeAccounts = data.activeAccounts[0].total;
  const transactions = data.transactions[0].total;
  const networkFees = data.networkFees;

  return {
    dailyActiveUsers: Number(activeAccounts),
    dailyTransactionsCount: Number(transactions),
    dailyGasUsed: networkFees.reduce((sum: number, metric: any) => sum + Number(metric.total), 0) / 1e8,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HEDERA],
  protocolType: ProtocolType.CHAIN,
  start: "2019-09-13",
};

export default adapter;
