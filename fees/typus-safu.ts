import { postURL } from "../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

const url = "https://app.sentio.xyz/api/v1/insights/typus/typus_v2/query";

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

const buildQueryPayload = (start: number, end: number) => ({
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
    {
      metricsQuery: {
        query: "SafuAccumulatedRewardGeneratedUSD",
        alias: "{{coin_symbol}}",
        id: "f",
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
      alias: "Protocol Fee",
      id: "B",
      disabled: false,
      functions: [],
      color: "",
    },
    {
      expression: "sum(f)",
      alias: "User Fee",
      id: "C",
      disabled: false,
      functions: [],
      color: "",
    },
  ],
  cachePolicy: {
    noCache: true,
  },
});

const fetch = async (_t: any, _b: any, { startOfDay }: FetchOptions): Promise<FetchResultV2> => {
  const [feeRes] = await Promise.all([
    postURL(url, buildQueryPayload(startOfDay, startOfDay + 86400), 3, options),
  ]);

  const user_usd = feeRes?.results?.find((res: any) => res.alias === "User Fee").matrix?.samples?.[0]?.values;

  const protocol_fee_usd = feeRes?.results?.find((res: any) => res.alias === "Protocol Fee").matrix
    ?.samples?.[0]?.values;

  // Already calculated the rollup delta, so use the first value (which counts from start to end)
  const userFees = user_usd.at(0).value;
  const protocolFees = protocol_fee_usd.at(0).value;

  return {
    dailyFees: userFees + protocolFees,
    dailyRevenue: userFees + protocolFees,
    dailyProtocolRevenue: protocolFees,
    dailyUserFees: userFees,
    dailySupplySideRevenue: userFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
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
