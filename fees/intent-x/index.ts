import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint_0_8_0 = "https://api.studio.thegraph.com/query/62472/perpetuals-analytics_base/version/latest";
const endpoint =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-base-analytics-083/latest/gn";
const endpoint_blast =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-blast-analytics-083/latest/gn";
const endpoint_mantle =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-mantle-analytics-083/latest/gn";
const endpoint_arbitrum =
  "https://api.goldsky.com/api/public/project_cm0bho0j0ji6001t8e26s0wv8/subgraphs/intentx-arbitrum-analytics-083/latest/gn";

const query_0_8_0 = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x724796d2e9143920B1b58651B04e1Ed201b8cC98" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0x724796d2e9143920B1b58651B04e1Ed201b8cC98" }) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`;

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: { timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: { accountSource: "0x8Ab178C07184ffD44F0ADfF4eA2ce6cFc33F3b86" }) {
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
    totalHistories(where: { accountSource: "0x083267D20Dbe6C2b0A83Bd0E601dC2299eD99015" }) {
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
    totalHistories(where: { accountSource: "0xECbd0788bB5a72f9dFDAc1FFeAAF9B7c2B26E456" }) {
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
    totalHistories(where: { accountSource: "0x141269E29a770644C34e05B127AB621511f20109" }) {
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
  totalHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: BigNumber;
  }>;
}

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

const fetchVolume = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const response_0_8_0: IGraphResponse = await request(endpoint_0_8_0, query_0_8_0, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });

  // Merging both responses
  let dailyFees = new BigNumber(0);
  response_0_8_0.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });
  response.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });

  let totalFees = new BigNumber(0);
  response_0_8_0.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });
  response.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  totalFees = totalFees.dividedBy(new BigNumber(1e18));

  const _dailyFees = toString(dailyFees);
  const _totalFees = toString(totalFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = "0";
  const totalSupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees,
    totalFees: _totalFees,

    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    totalUserFees: totalUserFees,
    totalRevenue: totalRevenue,
    totalProtocolRevenue: totalProtocolRevenue,
    totalSupplySideRevenue: totalSupplySideRevenue,
  };
};

const fetchVolumeBlast = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  if (startTimestamp > 1728432000){
    return {}
  }

  let dailyFees = new BigNumber(0);
  let totalFees = new BigNumber(0);

  const response_blast: IGraphResponse = await request(endpoint_blast, queryBlast, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });
  response_blast.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });
  response_blast.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  totalFees = totalFees.dividedBy(new BigNumber(1e18));
  const _dailyFees = toString(dailyFees);
  const _totalFees = toString(totalFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = "0";
  const totalSupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees,
    totalFees: _totalFees,

    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    totalUserFees: totalUserFees,
    totalRevenue: totalRevenue,
    totalProtocolRevenue: totalProtocolRevenue,
    totalSupplySideRevenue: totalSupplySideRevenue,
  };
};

const fetchVolumeMantle = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  let dailyFees = new BigNumber(0);
  let totalFees = new BigNumber(0);

  const response_mantle: IGraphResponse = await request(endpoint_mantle, queryMantle, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });
  response_mantle.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });
  response_mantle.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  totalFees = totalFees.dividedBy(new BigNumber(1e18));
  const _dailyFees = toString(dailyFees);
  const _totalFees = toString(totalFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = "0";
  const totalSupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees,
    totalFees: _totalFees,

    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    totalUserFees: totalUserFees,
    totalRevenue: totalRevenue,
    totalProtocolRevenue: totalProtocolRevenue,
    totalSupplySideRevenue: totalSupplySideRevenue,
  };
};

const fetchVolumeArbitrum = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  let dailyFees = new BigNumber(0);
  let totalFees = new BigNumber(0);

  const response_arbitrum: IGraphResponse = await request(endpoint_arbitrum, queryArbitrum, {
    from: String(startTimestamp),
    to: String(endTimestamp),
  });
  response_arbitrum.dailyHistories.forEach((data) => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee));
  });
  response_arbitrum.totalHistories.forEach((data) => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee));
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18));
  totalFees = totalFees.dividedBy(new BigNumber(1e18));
  const _dailyFees = toString(dailyFees);
  const _totalFees = toString(totalFees);

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = "0";
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = "0";

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = "0";
  const totalSupplySideRevenue = "0";

  return {
    dailyFees: _dailyFees,
    totalFees: _totalFees,

    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    totalUserFees: totalUserFees,
    totalRevenue: totalRevenue,
    totalProtocolRevenue: totalProtocolRevenue,
    totalSupplySideRevenue: totalSupplySideRevenue,
  };
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolume,
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
