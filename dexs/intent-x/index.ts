import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const baseEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";
const blastEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-blast-analytics-083/latest/gn";
const mantleEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-mantle-analytics-083/latest/gn";
const arbitrumEndpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-arbitrum-analytics-083/latest/gn";


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

const queryBlast = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x083267D20Dbe6C2b0A83Bd0E601dC2299eD99015" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const queryMantle = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0xECbd0788bB5a72f9dFDAc1FFeAAF9B7c2B26E456" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const queryArbitrum = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x141269E29a770644C34e05B127AB621511f20109" }
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

const fetchVolumeBlast = async (timestamp: number): Promise<FetchResultVolume> => {
  if (timestamp > 1728432000){
    return {}
  }

  let dailyMakerVolume = new BigNumber(0);
  let dailyTakerVolume = new BigNumber(0);

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const response: IGraphResponse = await request(blastEndpoint, queryBlast, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });
  response.dailyHistories.forEach((data) => {
    dailyMakerVolume = dailyMakerVolume.plus(new BigNumber(data.tradeVolume));
    dailyTakerVolume = dailyTakerVolume.plus(new BigNumber(data.tradeVolume));
  });

  const dailyVolume = dailyMakerVolume.plus(dailyTakerVolume).dividedBy(new BigNumber(1e18));

  const _dailyVolume = toString(dailyVolume);

  return {
    timestamp: dayTimestamp,
    dailyVolume: _dailyVolume ?? "0",
  };
};

const fetchVolumeMantle = async (timestamp: number): Promise<FetchResultVolume> => {
  let dailyMakerVolume = new BigNumber(0);
  let dailyTakerVolume = new BigNumber(0);

  const response: IGraphResponse = await request(mantleEndpoint, queryMantle, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });
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

const fetchVolumeArbitrum = async (timestamp: number): Promise<FetchResultVolume> => {
  let dailyMakerVolume = new BigNumber(0);
  let dailyTakerVolume = new BigNumber(0);

  const response: IGraphResponse = await request(arbitrumEndpoint, queryArbitrum, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp),
  });
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
      start: '2023-11-01',
    },
    [CHAIN.BLAST]: {
      fetch: fetchVolumeBlast,
      start: '2023-11-01',
    },
    [CHAIN.MANTLE]: {
      fetch: fetchVolumeMantle,
      start: '2023-11-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolumeArbitrum,
      start: '2023-11-01',
    },
  },
};

export default adapter;
