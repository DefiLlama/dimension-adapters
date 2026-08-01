import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";

const fetch = async (_: any) => {
  let openInterestAtEnd = (await fetchURL("https://api.synfutures.com/s3/config/info-page/v3/overview.json")).totalOI;
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2024-06-26',
  runAtCurrTime: true
};

export default adapter;
