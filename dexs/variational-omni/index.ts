import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

const fetch = async (_: any) => {
  const data = await fetchUrl(URL);
  const listings = data?.listings ?? [];
  const dailyVolume = Number(data?.total_volume_24h || 0);

  // const openInterestAtEnd = listings.reduce((acc: number, market: any) => {
  //   const longOI = Number(market?.open_interest?.long_open_interest || 0);
  //   const shortOI = Number(market?.open_interest?.short_open_interest || 0);
  //   return acc + longOI + shortOI;
  // }, 0);

  // const dualSidedOpenInterestAtEnd = openInterestAtEnd * 2;

  return {
    // openInterestAtEnd: dualSidedOpenInterestAtEnd,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  runAtCurrTime: true,
  start: "2025-01-30", //Mainnet Private Beta
};

export default adapter;