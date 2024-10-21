import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import {
  getEmptyData,
  getDimensionsSum,
  CarbonAnalyticsItem,
  // getDimensionsSumByToken,
} from "./utils";

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
    endpoint: "https://api.carbondefi.xyz/v1/analytics/volume",
    startBlock: 17087375,
    startTimestamp: 1681986059,
    getDimensionsByToken: false,
  },
  [CHAIN.SEI]: {
    endpoint: "https://sei-api.carbondefi.xyz/v1/analytics/volume",
    startBlock: 79146720,
    startTimestamp: 1716825673,
    getDimensionsByToken: false,
  },
  [CHAIN.CELO]: {
    endpoint: "https://celo-api.carbondefi.xyz/v1/analytics/volume",
    startBlock: 26828280,
    startTimestamp: 1721813184,
    getDimensionsByToken: false,
  },
};

const getData = async (options: FetchOptions) => {
  const analyticsEndpoint = chainInfo[options.chain].endpoint;
  // const getDimensionsByToken = chainInfo[options.chain].getDimensionsByToken;
  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;

  try {
    const swapData: CarbonAnalyticsItem[] = await fetchURL(analyticsEndpoint);

    // if (getDimensionsByToken) {
    //   return getDimensionsSumByToken(
    //     swapData,
    //     startTimestamp,
    //     endTimestamp,
    //     getEmptyData(options),
    //   );
    // }
    return getDimensionsSum(swapData, startTimestamp, endTimestamp);
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
