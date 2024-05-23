// https://heliswap-prod-362307.oa.r.appspot.com/query
import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const tokens: string[] = [
'0x00000000000000000000000000000000002cc823',
'0x000000000000000000000000000000000008437c',
'0x0000000000000000000000000000000000101Ae3',
'0x000000000000000000000000000000000006f89a',
'0x0000000000000000000000000000000000101aF0',
'0x0000000000000000000000000000000000101aFb',
'0x0000000000000000000000000000000000107d76',
'0x0000000000000000000000000000000000101Af5',
'0x0000000000000000000000000000000000083E9E',
'0x00000000000000000000000000000000000cbA44',
'0x00000000000000000000000000000000000Ec585',
'0x00000000000000000000000000000000000D1ea6',
'0x0000000000000000000000000000000000098779',
'0x00000000000000000000000000000000000E22B1',
'0x000000000000000000000000000000000001f385',
'0x00000000000000000000000000000000001139fd',
'0x00000000000000000000000000000000001176B5',
'0x0000000000000000000000000000000000107980',
'0x0000000000000000000000000000000000163748',
'0x000000000000000000000000000000000011219e',
'0x000000000000000000000000000000000012E088',
'0x00000000000000000000000000000000001d90C9',
'0x00000000000000000000000000000000000ff4DA',
'0x000000000000000000000000000000000022D6de',
'0x00000000000000000000000000000000002D4720',
'0x00000000000000000000000000000000002A30A8',
'0x000000000000000000000000000000000021226e',
];

const query = `
  query getWhitelistedPools($tokens: [String]!) {
    poolsConsistingOf(tokens: $tokens) {
      volume24hUsd
    }
  }
`;


const graphQLClient = new GraphQLClient("https://heliswap-prod-362307.oa.r.appspot.com/query");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  volume24hUsd: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(query, { tokens: tokens})).poolsConsistingOf;
  const dailyVolume = historicalVolume
    .filter((e: IGraphResponse) => Number(e.volume24hUsd) < 10_000_000)
    .reduce((a: number, b: IGraphResponse) => a+Number(b.volume24hUsd), 0)

  return {
    // totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1664928000
    },
  },
};

export default adapter;
