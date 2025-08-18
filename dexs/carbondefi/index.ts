import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDimensionsSum } from "./utils";

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
  [CHAIN.TAC]: {
    endpoint: "https://api.carbondefi.xyz/v1/tac/analytics/volume",
    startTimestamp: 1750939200,
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
  methodology: {
    Volume:
      "Volume data is sourced from the CarbonDeFi Analytics API, which aggregates volumeUsd metrics from all swaps on the protocol.",
    Fees: "Fee data is sourced from the CarbonDeFi Analytics API, which aggregates feesUsd metrics from all trading fees collected by the protocol.",
  },
  version: 1,
  fetch: getData,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: chainInfo[CHAIN.ETHEREUM].startTimestamp,
    },
    [CHAIN.SEI]: {
      start: chainInfo[CHAIN.SEI].startTimestamp,
    },
    [CHAIN.CELO]: {
      start: chainInfo[CHAIN.CELO].startTimestamp,
    },
    [CHAIN.COTI]: {
      start: chainInfo[CHAIN.COTI].startTimestamp,
    },
    [CHAIN.TAC]: {
      start: chainInfo[CHAIN.TAC].startTimestamp,
    },
  },
};
export default adapter;
