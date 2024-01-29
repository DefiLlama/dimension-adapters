import { GraphQLClient, gql } from 'graphql-request';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';

const CHAINS = [
  'Arbitrum',
  'Avalanche',
  'Base',
  'BSC',
  'Celo',
  'Ethereum',
  'Fantom',
  'Optimism',
  'Polygon',
];

const graphQLClient = new GraphQLClient('https://api.0x.org/data/v0');
const getGQLClient = () => {
  graphQLClient.setHeader(
    '0x-api-key',
    process.env.ZEROx_API_KEY ?? ''
  );
  return graphQLClient;
};

const getVolumeByChain = async (chain: string) => {
  const client = getGQLClient();
  const req = gql`
    query Query_root {
      aggTransactionsDailyRouter(
        order_by: [{ timestamp: desc, chainName: null }]
        where: { chainName: { _eq: ${chain} } }
      ) {
        chainName
        timestamp
        transactions
        volumeUSD
      }
    }
  `;

  const data = (await client.request(req))[
    'aggTransactionsDailyRouter'
  ];
  return data;
};

const fetch = (chain: string) => async (timestamp: number) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  try {
    const data = await getVolumeByChain(chain);
    const dayData = data.find(
      ({ timestamp }: { timestamp: number }) =>
        getUniqStartOfTodayTimestamp(new Date(timestamp)) ===
        unixTimestamp
    );

    return {
      dailyVolume: dayData?.volumeUSD ?? '0',
      timestamp: unixTimestamp,
    };
  } catch (e) {
    return {
      dailyVolume: '0',
      timestamp: unixTimestamp,
    };
  }
};

const adapter: any = {
  adapter: {
    ...Object.values(CHAINS).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetch(chain),
          start: async () => 1671062400,
        },
      };
    }, {}),
  },
};

export default adapter;
