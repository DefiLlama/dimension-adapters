import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEmptyData, getDimensionsSum } from "./utils";

const CARBON_METADATA: {
  methodology: IJSON<string>;
  hallmarks: [number, string][];
} = {
  hallmarks: [
    [1681986059, "CarbonDeFi Ethereum Launch"],
    [1715990400, "CarbonDeFi Coti Launch"],
    [1716825673, "CarbonDeFi Sei Launch"],
    [1721813184, "CarbonDeFi Celo Launch"],
  ],
  methodology: {
    Volume:
      "Volume data is sourced from the CarbonDeFi Analytics API, which aggregates volumeUsd metrics from all swaps on the protocol.",
    Fees: "Fee data is sourced from the CarbonDeFi Analytics API, which aggregates feesUsd metrics from all trading fees collected by the protocol.",
  },
};

const chainInfo: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://api.carbondefi.xyz/v1/ethereum/analytics/volume",
    startTimestamp: 1681986059,
  },
  [CHAIN.SEI]: {
    endpoint: "https://api.carbondefi.xyz/v1/sei/analytics/volume",
    startTimestamp: 1716825673,
  },
  [CHAIN.CELO]: {
    endpoint: "https://api.carbondefi.xyz/v1/celo/analytics/volume",
    startTimestamp: 1721813184,
  },
  [CHAIN.COTI]: {
    endpoint: "https://api.carbondefi.xyz/v1/coti/analytics/volume",
    startTimestamp: 1715990400,
  },
};

const getData = async (_a: any, _b: any, options: FetchOptions) => {
  const analyticsEndpoint = chainInfo[options.chain].endpoint;
  const chainStartTimestamp = chainInfo[options.chain].startTimestamp;

  return getDimensionsSum(
    analyticsEndpoint,
    options.fromTimestamp,
    options.toTimestamp,
    chainStartTimestamp
  )
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getData,
      start: chainInfo[CHAIN.ETHEREUM].startTimestamp,
      meta: CARBON_METADATA,
    },
    [CHAIN.SEI]: {
      fetch: getData,
      start: chainInfo[CHAIN.SEI].startTimestamp,
      meta: CARBON_METADATA,
    },
    [CHAIN.CELO]: {
      fetch: getData,
      start: chainInfo[CHAIN.CELO].startTimestamp,
      meta: CARBON_METADATA,
    },
    [CHAIN.COTI]: {
      fetch: getData,
      start: chainInfo[CHAIN.COTI].startTimestamp,
      meta: CARBON_METADATA,
    },
  },
};
export default adapter;
