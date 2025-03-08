import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEmptyData, getDimensionsSum } from "./utils";

const CARBON_METADATA: {
  methodology: IJSON<string>;
  hallmarks: [number, string][];
} = {
  hallmarks: [
    [1681986059, "CarbonDeFi Ethereum Launch"],
    [1716825673, "CarbonDeFi Sei Launch"],
    [1721813184, "CarbonDeFi Celo Launch"],
  ],
  methodology: {
    Volume:
      "Volume is calculated as the sum of the targetAmount tokens from TokensTraded events emitted by the CarbonController contract.",
    Fees: "Fees are calculated as the sum of the tradingFeeAmount amount for the sourceToken if tradeByTarget is true or the targetToken if tradeByTarget is false, taken from TokensTraded events emitted by the CarbonController contract.",
  },
};

const chainInfo: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://api.carbondefi.xyz/v1/ethereum/analytics/volume",
    startBlock: 17087375,
    startTimestamp: 1681986059,
  },
  [CHAIN.SEI]: {
    endpoint: "https://api.carbondefi.xyz/v1/sei/analytics/volume",
    startBlock: 79146720,
    startTimestamp: 1716825673,
  },
  [CHAIN.CELO]: {
    endpoint: "https://api.carbondefi.xyz/v1/celo/analytics/volume",
    gasToken: "0x471EcE3750Da237f93B8E339c536989b8978a438",
    startBlock: 26828280,
    startTimestamp: 1721813184,
  },
};

const getData = async (options: FetchOptions) => {
  const analyticsEndpoint = chainInfo[options.chain].endpoint;
  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;
  const chainStartTimestamp = chainInfo[options.chain].startTimestamp;

  try {
    return getDimensionsSum(
      analyticsEndpoint,
      startTimestamp,
      endTimestamp,
      chainStartTimestamp
    );
  } catch (e) {
    console.error(e);
    // Return empty values
    return getEmptyData(options);
  }
};

const adapter: SimpleAdapter = {
  version: 2,
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
  },
};
export default adapter;
