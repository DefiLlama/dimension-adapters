import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, request } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm58q8wq01kbk01ts09lc52kp/subgraphs/mz-subgraph/main/gn";

const callAssetAbi = 'function callAsset() view returns (address)';
const putAssetAbi = 'function putAsset() view returns (address)';
const decimalsAbi = 'function decimals() view returns (uint8)';

// cache market → { token, decimals }
const marketInfoCache: Record<string, { token: string; decimals: number }> = {};
async function fetchMarketInfo(options: FetchOptions, market: string, isCall: boolean) {
  const key = `${market}-${isCall}`;
  if (marketInfoCache[key]) return marketInfoCache[key];


  const token = await options.api.call({
    abi: isCall ? callAssetAbi : putAssetAbi,
    target: market,
  })
  const decimals = await options.api.call({
    abi: decimalsAbi,
    target: token,
  })

  return (marketInfoCache[key] = { token, decimals });
}

const OPTIONS_QUERY = (start: number, end: number) => gql`
  {
    optionsPositions(
      where: { mintTimestamp_gte: ${start}, mintTimestamp_lt: ${end} }
    ) {
      premium
      protocolFees
      market
      isCall
    }
  }
`;

const fetchFn = async (options: FetchOptions): Promise<FetchResultV2> => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const endOfDay = startOfDay + 86400;

  const { optionsPositions } = await request(
    SUBGRAPH_URL,
    OPTIONS_QUERY(startOfDay, endOfDay)
  );

  const dailyFees = options.createBalances(); // protocolFees only
  const dailyVolume = options.createBalances(); // premium + protocolFees

  for (const pos of optionsPositions) {
    const pf = BigInt(pos.protocolFees);
    const prem = BigInt(pos.premium);
    const { token } = await fetchMarketInfo(options, pos.market, pos.isCall);

    dailyFees.add(token, pf);
    dailyVolume.add(token, pf + prem);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchFn,
      start: '2024-12-26', // subgraph deployment
    },
  },
  methodology: {
    Fees: "Total fees from minted options.",
    Revenue: "Protocol revenue from minted options.",
    Volume: "Total notional (sum of premium + protocolFees) from minted options. ",
  },
};

export default adapter;
