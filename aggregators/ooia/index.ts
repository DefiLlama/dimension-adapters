import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BaseURL = "https://apiprod662ba0315.ooia.art";
const endpoint = "api/v1/collections/defillama/analytics/volumes";
const currency = "USDT";

interface IAPIResponse {
  dailyVolume: string;
  totalVolume: string;
}
const fromMicro = (value: string) => {
  return (parseFloat(value) / 1e6).toString();
};

const fetch: FetchV2 = async ({ endTimestamp }: FetchOptions) => {
  const { dailyVolume, totalVolume }: IAPIResponse = await fetchURL(
    `${BaseURL}/${endpoint}?timestamp=${endTimestamp}&currency=${currency}`
  );
  return {
    dailyVolume: fromMicro(dailyVolume),
    totalVolume: fromMicro(totalVolume),
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: "2024-11-01",
      fetch,
    },
  },
};
export default adapters;
