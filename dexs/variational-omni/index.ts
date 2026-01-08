import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

const fetch = async (_: any) => {
  const data = await fetchUrl(URL);

  return {
    openInterestAtEnd: data.open_interest,
    dailyVolume: data?.total_volume_24h ,
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