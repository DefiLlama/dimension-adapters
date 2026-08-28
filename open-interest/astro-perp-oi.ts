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
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
