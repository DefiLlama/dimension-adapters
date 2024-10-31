import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
    controller: "0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1",
    startBlock: 17087375,
    startTimestamp: 1681986059,
    getDimensionsByToken: false,
  },
  [CHAIN.SEI]: {
    endpoint: "https://api.carbondefi.xyz/v1/sei/analytics/volume",
    controller: "0xe4816658ad10bF215053C533cceAe3f59e1f1087",
    startBlock: 79146720,
    startTimestamp: 1716825673,
    getDimensionsByToken: true,
  },
  [CHAIN.CELO]: {
    endpoint: "https://api.carbondefi.xyz/v1/celo/analytics/volume",
    controller: "0x6619871118D144c1c28eC3b23036FC1f0829ed3a",
    gasToken: "0x471EcE3750Da237f93B8E339c536989b8978a438",
    startBlock: 26828280,
    startTimestamp: 1721813184,
    getDimensionsByToken: true,
  },
};

const getData = async (options: FetchOptions) => {
  const analyticsEndpoint = chainInfo[options.chain].endpoint;
  const getDimensionsByToken = chainInfo[options.chain].getDimensionsByToken;
  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;
  const controller = chainInfo[options.chain].controller;

  try {
    if (getDimensionsByToken) {
      const pairs: string[] = (
        await options.api.call({
          target: controller,
          abi: "function pairs() view returns (address[2][])",
        })
      ).flat();
      const uniqueTokens: string[] = [...new Set(pairs)];
      return getDimensionsSumByToken(
        analyticsEndpoint,
        uniqueTokens,
        startTimestamp,
        endTimestamp,
        getEmptyData(options)
      );
    }
    return getDimensionsSum(analyticsEndpoint, startTimestamp, endTimestamp);
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
