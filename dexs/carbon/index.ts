import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const baseEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";

const queryBase = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
}

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

const fetchVolumeBase = async (timestamp: number): Promise<FetchResultVolume> => {
  const response: IGraphResponse = await request(baseEndpoint, queryBase, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });

  let dailyMakerVolume = new BigNumber(0);
  let dailyTakerVolume = new BigNumber(0);

  response.dailyHistories.forEach((data) => {
    dailyMakerVolume = dailyMakerVolume.plus(new BigNumber(data.tradeVolume));
    dailyTakerVolume = dailyTakerVolume.plus(new BigNumber(data.tradeVolume));
  });

  const dailyVolume = dailyMakerVolume.plus(dailyTakerVolume).dividedBy(new BigNumber(1e18));

  const _dailyVolume = toString(dailyVolume);

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  return {
    timestamp: dayTimestamp,
    dailyVolume: _dailyVolume ?? "0",
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolumeBase,
      start: "2023-11-01",
    },
  },
};

export default adapter;
