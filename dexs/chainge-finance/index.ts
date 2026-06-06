import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api2.chainge.finance/thirdparty/dao/getDashboardInfo"

interface IAPIResponse {
  dayVolume: number;
};

const fetch = async (options: FetchOptions) => {
  const response: IAPIResponse = (await fetchURL(URL)).data;
  return {
    dailyVolume: `${response?.dayVolume}` || undefined,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: "2026-04-01",
  fetch,
  chains: [CHAIN.FUSION],
  runAtCurrTime: true,
};

export default adapter;
