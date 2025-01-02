import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
const query = `
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { daoFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { daoFee, tokenPriceAtFeeMint }
      }`


// if graph goes down, can be pulled via event logs, example:
// https://optimistic.etherscan.io/tx/0x265e1eeb9a2c68ef8f58fe5e1d7e3f1151dd5e6686d4147445bf1bd8895deb38#eventlog check topic: 0x755a8059d66d8d243bc9f6913f429a811f154599d0538bb0b6a2ac23f23d2ccd
/* const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const logs = await getLogs({
    eventAbi: 'event ManagerFeeMinted (address pool, address manager, uint256 available, uint256 daoFee, uint256 managerFee, uint256 tokenPriceAtLastFeeMint)',
  });
  logs.forEach(i => {
    dailyFees.addUSDValue(i.daoFee.toString() * i.tokenPriceAtLastFeeMint.toString() / 1e36)
  });

  return { dailyFees, dailyRevenue: dailyFees };
} */
const PROVIDER_CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-optimism/version/latest",
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-polygon/version/latest",
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-arbitrum/version/latest",
  },
  [CHAIN.BASE]: {
    startTimestamp: 1712227101,
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-base-mainnet/version/latest",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, query: string, volumeField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = PROVIDER_CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        first: batchSize,
        skip
      });

      const entries = data[volumeField];
      if (entries.length === 0) break;
      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;

    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

const calculateFees = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const daoFee = Number(item.daoFee);
    const tokenPrice = Number(item.tokenPriceAtFeeMint);
    const daoFeeInEth = daoFee / 1e18;
    const tokenPriceInEth = tokenPrice / 1e18;
    const result = daoFeeInEth * tokenPriceInEth;
    return acc + result;
  }, 0);

const fetch = async ({ chain, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = PROVIDER_CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyFees = await fetchHistoricalFees(chain as CHAIN, query, 'managerFeeMinteds', startTimestamp, endTimestamp)

  return {
    dailyFees: calculateFees(dailyFees),
    dailyRevenue: calculateFees(dailyFees),
    timestamp: endTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: '2021-12-02', },
    [CHAIN.POLYGON]: { fetch, start: '2021-07-29', },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-03-27', },
    [CHAIN.BASE]: { fetch, start: '2023-12-20', },
  },
  version: 2
}

export default adapter;
