import { postURL } from "../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

const url_v1: any = {
  [CHAIN.SUI]: "https://app.sentio.xyz/api/v1/insights/wayne/typus_perp_v1/query",
};

const options_v1 = {
  headers: {
    "Content-Type": "application/json",
    "api-key": "EELeKBmbF8CkXmhWuunv3rKGOrmLHqEK1",
  },
};

const url: any = {
  [CHAIN.SUI]: "https://app.sentio.xyz/api/v1/insights/typus/typus_perp/query",
};

const options = {
  headers: {
    "Content-Type": "application/json",
    "api-key": "hCsD8shJaUbbiNLMKBG3oKhr9PL3H5EJ5",
  },
};

const methodology = {
  Fees: "Typus Perp fees are charged from perp trading fees and liquidation fees.",
  ProtocolRevenue:
    "30% of perp trading/liquidation fees and all TLP mint/burn fees are included in the protocol revenue.",
};

const buildQueryPayload = (_metricName: string, start: number, end: number) => ({
  timeRange: {
    start: start.toString(),
    end: end.toString(),
    step: 3600 * 4,
  },
  queries: [
    {
      metricsQuery: {
        query: "protocol_fee_usd",
        alias: "protocol_fee_usd",
        id: "a",
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
    {
      metricsQuery: {
        query: "tlp_fee_usd",
        alias: "tlp_fee_usd",
        id: "b",
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
  formulas: [],
  cachePolicy: {
    noCache: true,
  },
});

const fetch = async ({ startTimestamp, endTimestamp, chain }: FetchOptions): Promise<FetchResultV2> => {
  console.log(startTimestamp, endTimestamp);
  const feeRes = await postURL(
    startTimestamp < 1767225600 ? url_v1[chain] : url[chain],
    buildQueryPayload("", startTimestamp, endTimestamp),
    3,
    startTimestamp < 1767225600 ? options_v1 : options,
  );

  const tlp_fee_usd = feeRes?.results?.find((res: any) => res.alias === "tlp_fee_usd").matrix?.samples?.[0]
    ?.values;

  const protocol_fee_usd = feeRes?.results?.find((res: any) => res.alias === "protocol_fee_usd").matrix
    ?.samples?.[0]?.values;

  const tlpFees = tlp_fee_usd.at(-1).value - tlp_fee_usd.at(0).value;
  const protocolFees = protocol_fee_usd.at(-1).value - protocol_fee_usd.at(0).value;

  return {
    dailyFees: tlpFees + protocolFees,
    dailyRevenue: protocolFees,
    dailySupplySideRevenue: tlpFees,
    dailyProtocolRevenue: protocolFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-04-01",
    },
  },
  methodology,
};

export default adapter;
