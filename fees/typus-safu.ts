import { postURL } from "../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

const url: any = {
  [CHAIN.SUI]: "https://app.sentio.xyz/api/v1/insights/typus/typus_v2/query",
};

const options = {
  headers: {
    "Content-Type": "application/json",
    "api-key": "RIobs1PpAZ4SmHxY2InErtz0pL5LqHTtY",
  },
};

const methodology = {
  Fees: "Typus Safu fees are charged from the revenue of depositor's in-the-money options.",
  ProtocolRevenue: "All Safu fees are included in the protocol revenue.",
};

const buildQueryPayload = (_metricName: string, start: number, end: number) => ({
  timeRange: {
    start: start.toString(),
    end: end.toString(),
    step: 3600,
  },
  queries: [
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
        query: "SafuFee",
        alias: "{{coin_symbol}}",
        id: "e",
        labelSelector: {},
        aggregate: {
          op: "SUM",
          grouping: ["coin_symbol"],
        },
        functions: [
          {
            name: "rollup_delta",
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
  ],
  formulas: [
    {
      expression: "sum(e*c)",
      alias: "Total Fee",
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

const fetch = async ({ startTimestamp, endTimestamp, chain }: FetchOptions): Promise<FetchResultV2> => {
  const [feeRes] = await Promise.all([
    postURL(url[chain], buildQueryPayload("", startTimestamp, endTimestamp), 3, options),
  ]);
  // console.log(feeRes);

  const dailyFees = feeRes?.results?.[0]?.matrix?.samples?.[0]?.values.at(-1).value;
  // console.log(dailyFees);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-01-20",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
