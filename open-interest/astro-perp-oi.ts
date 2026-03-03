import {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

const BASE_URL = "https://llama.astros.ag/api/third/info";

const getHeaders = () => ({
  "api-key": getEnv("ASTROS_PERP_API_KEY"),
});

const fetch = async (_: FetchOptions): Promise<FetchResultV2> => {
  const oi = await httpGet(`${BASE_URL}/oi`, { headers: getHeaders() })

  const openInterestAtEnd = oi.data.reduce(
    (sum: number, item: any) => sum + Number(item.amount),
    0
  );

  return {
    openInterestAtEnd,
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
