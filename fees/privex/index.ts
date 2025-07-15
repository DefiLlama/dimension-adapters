import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

// Query for COTI - using totalHistories with timestamp range
const cotiQuery = gql`
  query fees($from: Int!, $to: Int!, $skip: Int!) {
    totalHistories(
      where: { timestamp_gte: $from, timestamp_lt: $to }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
      skip: $skip
    ) {
      platformFee
    }
  }
`;

// Query for Base - using dailyHistories with day
const baseQuery = gql`
  query fees($day: Int!, $skip: Int!) {
    dailyHistories(
      where: { day: $day }
      orderBy: day
      orderDirection: desc
      first: 1000
      skip: $skip
    ) {
      platformFee
    }
  }
`;

interface ICotiResponse {
  totalHistories: Array<{
    platformFee: string;
  }>;
}

interface IBaseResponse {
  dailyHistories: Array<{
    platformFee: string;
  }>;
}

const fetchCotiFees = async ({ createBalances, startTimestamp, endTimestamp, chain }: FetchOptions) => {
  try {
    let skip = 0;
    let total = new BigNumber(0);
    
    // Paginate through all results
    while (true) {
      const response: ICotiResponse = await request(endpoints[chain], cotiQuery, {
        from: startTimestamp,
        to: endTimestamp,
        skip,
      });

      if (!response?.totalHistories?.length) break;

      // Sum all platform fees in this page using BigNumber
      response.totalHistories.forEach((data) => {
        const platformFee = data.platformFee || "0";
        total = total.plus(platformFee);
      });

      // If we got less than 1000 results, we're done
      if (response.totalHistories.length < 1000) break;
      
      skip += response.totalHistories.length;
    }

    const dailyFees = createBalances();
    // Add as native token (gas token) converted from wei
    dailyFees.addGasToken(total.dividedBy("1e18").toString());
    
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  } catch (error) {
    console.error("Error fetching COTI fees:", error);
    const dailyFees = createBalances();
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  }
};

const fetchBaseFees = async ({ createBalances, endTimestamp, chain }: FetchOptions) => {
  try {
    const day = Math.floor(endTimestamp / 86400);
    let skip = 0;
    let total = new BigNumber(0);
    
    // Paginate through all results
    while (true) {
      const response: IBaseResponse = await request(endpoints[chain], baseQuery, {
        day,
        skip,
      });

      if (!response?.dailyHistories?.length) break;

      // Sum all platform fees in this page using BigNumber
      response.dailyHistories.forEach((data) => {
        const platformFee = data.platformFee || "0";
        total = total.plus(platformFee);
      });

      // If we got less than 1000 results, we're done
      if (response.dailyHistories.length < 1000) break;
      
      skip += response.dailyHistories.length;
    }

    const dailyFees = createBalances();
    // Add as native token (gas token) converted from wei
    dailyFees.addGasToken(total.dividedBy("1e18").toString());
    
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  } catch (error) {
    console.error("Error fetching Base fees:", error);
    const dailyFees = createBalances();
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  }
};

const methodology = {
  Fees: "Platform fees collected by PriveX from derivatives trading activities",
  Revenue: "All platform fees collected represent protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBaseFees,
      start: "2024-09-08",
      meta: { methodology },
    },
    [CHAIN.COTI]: {
      fetch: fetchCotiFees,
      start: "2025-01-01", 
      meta: { methodology },
    },
  },
};

export default adapter;
