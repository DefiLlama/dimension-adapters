import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Hgraph's GraphQL API powers HashScan's mainnet ecosystem metric
const HGRAPH_GRAPHQL_URL = "https://mainnet.hedera.api.hgraph.dev/v1/graphql";

const fetch = async (options: FetchOptions) => {
  const startDate = `${options.dateString}T00:00:00`;
  const query = `{
    newAccounts: ecosystem_metric(
      where: { name: { _eq: "new_accounts" }, period: { _eq: "day" }, start_date: { _eq: "${startDate}" } }
      limit: 1
    ) { total }
  }`;
  const { data } = await postURL(HGRAPH_GRAPHQL_URL, { query }, 3, {
    headers: { "X-API-KEY": process.env.HGRAPH_API_KEY },
  });

  const newAccounts = data.newAccounts[0].total;

  return {
    dailyNewUsers: Number(newAccounts),
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
