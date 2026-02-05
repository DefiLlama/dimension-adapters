import { postURL } from "../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

const url = "https://app.sentio.xyz/api/v1/insights/typus/typus_v2/query";

const methodology = {
  Fees: "Typus Dov fees are charged from depositor's premium fee and bider's trading fee.",
  ProtocolRevenue: "All Dov fees are included in the protocol revenue.",
};

const buildQueryPayload = (start: number, end: number) => ({
  timeRange: {
    start: start.toString(),
    end: end.toString(),
    step: 3600,
  },
  queries: [
    {
      metricsQuery: {
        query: "harvestFee",
        alias: "{{coin_symbol}}",
        id: "a",
        labelSelector: {},
        aggregate: {
          op: "SUM",
          grouping: ["coin_symbol"],
        },
        functions: [
          {
            name: "delta_over_time",
            arguments: [
              {
                durationValue: {
                  value: 1,
                  unit: "d",
                },
              },
            ],
          },
        ],
        color: "",
        disabled: true,
      },
      dataSource: "METRICS",
      sourceName: "",
    },
    {
      metricsQuery: {
        query: "totalBidderFee",
        alias: "{{coin_symbol}}",
        id: "b",
        labelSelector: {},
        aggregate: {
          op: "SUM",
          grouping: ["coin_symbol"],
        },
        functions: [
          {
            name: "delta_over_time",
            arguments: [
              {
                durationValue: {
                  value: 1,
                  unit: "d",
                },
              },
            ],
          },
        ],
        color: "",
        disabled: true,
      },
      dataSource: "METRICS",
      sourceName: "",
    },
    {
      priceQuery: {
        id: "c",
        alias: "{{coin_symbol}}",
        coinId: [],
        color: "",
        disabled: true,
      },
      dataSource: "PRICE",
      sourceName: "",
    },
    {
      metricsQuery: {
        query: "compoundFee",
        alias: "{{coin_symbol}}",
        id: "d",
        labelSelector: {},
        aggregate: {
          op: "SUM",
          grouping: ["coin_symbol"],
        },
        functions: [
          {
            name: "delta_over_time",
            arguments: [
              {
                durationValue: {
                  value: 1,
                  unit: "d",
                },
              },
            ],
          },
        ],
        color: "",
        disabled: true,
      },
      dataSource: "METRICS",
      sourceName: "",
    },
    {
      metricsQuery: {
        query: "AccumulatedPremiumUSD",
        alias: "Total Fee",
        id: "e",
        labelSelector: {},
        aggregate: {
          op: "SUM",
          grouping: [],
        },
        functions: [],
        color: "",
        disabled: false,
      },
      dataSource: "METRICS",
      sourceName: "",
    },
  ],
  formulas: [
    {
      expression: "sum((a+b+d)*c)",
      alias: "Total Revenue",
      id: "B",
      disabled: false,
      functions: [],
      color: "",
    },
  ],
  cachePolicy: {
    noCache: true,
  },
});

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const [feeRes] = await Promise.all([
    postURL(url, buildQueryPayload(options.startTimestamp, options.endTimestamp), 3, {
      headers: {
        "Content-Type": "application/json",
        "api-key": "RIobs1PpAZ4SmHxY2InErtz0pL5LqHTtY",
      },
    }),
  ]);

  const fee_usd = feeRes?.results?.find((res: any) => res.alias === "Total Fee").matrix?.samples?.[0]?.values;
  const tf = fee_usd.at(-1).value;
  const dailyFees = tf - fee_usd.at(0).value;

  const revenue_fee_usd = feeRes?.results?.find((res: any) => res.alias === "Total Revenue").matrix
    ?.samples?.[0]?.values;
  const dailyRevenue = revenue_fee_usd.at(-1).value;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-01-14",
    },
  },
  methodology,
};

export default adapter;
