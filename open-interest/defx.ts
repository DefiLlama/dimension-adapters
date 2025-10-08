import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async () => {
  const { data } = await fetchURL("https://api.defx.com/v1/open/analytics/market/overview");

  return { openInterestAtEnd: data.openInterest, dailyFees: data.dayFees, dailyVolume: data.dayVol };
}

export default {
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  runAtCurrTime: true,
}