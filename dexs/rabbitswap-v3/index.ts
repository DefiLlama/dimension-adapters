import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfNextDayUTC,
} from "../../utils/date";
import { gql, GraphQLClient } from "graphql-request";

const getDailyVolume = () => {
  return gql`
    query RabbitSwapVol($dateTimestamp: Int) {
      daily: uniDayData(filter: { timestamp: { equalTo: $dateTimestamp } }) {
        aggregates {
          sum {
            volumeUSD
            feesUSD
          }
        }
      }
      total: uniDayData {
        aggregates {
          sum {
            volumeUSD
            feesUSD
          }
        }
      }
    }
  `;
};

const graphQLClient = new GraphQLClient(
  "https://api.subquery.network/sq/UpshotDEX/rabbit-dex"
);

interface IResponse {
  daily: {
    aggregates: {
      sum: {
        volumeUSD: number;
        feesUSD: number;
      };
    };
  };
  total: {
    aggregates: {
      sum: {
        volumeUSD: number;
        feesUSD: number;
      };
    };
  };
}

const fetch = async (timestamp: number) => {
  const dateTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const response: IResponse = await graphQLClient.request(getDailyVolume(), {
    dateTimestamp,
  });
  const dailyVolume = response?.daily?.aggregates?.sum?.volumeUSD;
  const totalVolume = response?.total?.aggregates?.sum?.volumeUSD;
  const dailyFees = response?.daily?.aggregates?.sum?.feesUSD;
  const totalFees = response?.total?.aggregates?.sum?.feesUSD;

  return {
    timestamp: timestamp,
    dailyVolume: `${dailyVolume}`,
    totalVolume: `${totalVolume}`,
    dailyFees: `${dailyFees}`,
    totalFees: `${totalFees}`,
    dailyUserFees: `${dailyFees}`,
    totalUserFees: `${totalFees}`,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TOMOCHAIN]: {
      fetch: fetch,
      start: "2024-11-12",
      meta: {
        methodology: {
          Volume: "USD Volume of RabbitSwap V3 using datasource from SubQuery.",
          Fees: "USD Fees of RabbitSwap V3 using datasource from SubQuery.",
        },
      },
    },
  },
};

export default adapter;
