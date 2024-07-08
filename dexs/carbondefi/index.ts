import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { CarbonAnalyticsResponse } from "./types";
import {
  getEmptyData,
  getDimensionsSum,
  getDimensionsSumByToken,
} from "./utils";

const CARBON_METADATA: {
  methodology: IJSON<string>;
  hallmarks: [number, string][];
} = {
  hallmarks: [
    [1681986059, "CarbonDeFi Ethereum Launch"],
    [1716825673, "CarbonDeFi Sei Launch"],
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
    getVolumeByToken: false,
  },
  [CHAIN.SEI]: {
    endpoint: "https://sei-api.carbondefi.xyz/v1/analytics/volume",
    startBlock: 79146720,
    startTimestamp: 1716825673,
    getVolumeByToken: true,
  },
};

const getData = async (options: FetchOptions) => {
  const analyticsEndpoint = chainInfo[options.chain].endpoint;
  const getVolumeByToken = chainInfo[options.chain].getVolumeByToken;
  const startTimestamp = options.startOfDay;
  const endTimestamp = options.toTimestamp;

  try {
    const swapData: CarbonAnalyticsResponse = await fetchURL(analyticsEndpoint);

    if (getVolumeByToken) {
      const volumeSumByToken = getDimensionsSumByToken(
        swapData,
        startTimestamp,
        endTimestamp,
        getEmptyData(options)
      );
      return volumeSumByToken;
    }
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
  },
};
export default adapter;
