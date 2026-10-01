import {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_URL =
  "https://api.astros.ag/api/contract-sub-provider/openapi/pub/defillama";

const fetch = async (_: FetchOptions): Promise<FetchResultV2> => {
  const { data } = await httpGet(API_URL);

  return {
    openInterestAtEnd: Number(data.open_interest),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    // Off-chain order book with only a deposit contract on Sui (the audits cover the deposit
    // contract alone and fills carry no Sui digests), so the venue is keyed as off_chain rather
    // than Sui.
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
