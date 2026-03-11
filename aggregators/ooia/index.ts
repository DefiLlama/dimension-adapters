import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = "https://apiprod662ba0315.ooia.art/api/v1/collections/defillama/analytics/volumes";
const currency = "USDT";

interface IAPIResponse {
  dailyVolume: string;
}
const fromMicro = (value: string) => {
  return (parseFloat(value) / 1e6).toString();
};

const fetch = async (_a: any, _b: any, { startOfDay }: FetchOptions) => {
  const { dailyVolume }: IAPIResponse = await fetchURL(
    `${url}?timestamp=${startOfDay}&currency=${currency}`
  );

  return {
    dailyVolume: fromMicro(dailyVolume),
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: "2024-11-01",
    },
  },
};
export default adapters;
