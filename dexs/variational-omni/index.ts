import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { tickerToCgId } from "../../helpers/coingeckoIds";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

const fetch = async (options: FetchOptions) => {
  const data = await fetchUrl(URL);
  const dailyVolume = options.createBalances();

  for (const listing of data.listings) {
    const cgId = tickerToCgId[listing.ticker];
    const vol = Number(listing.volume_24h);
    const markPrice = Number(listing.mark_price);

    if (cgId && markPrice > 0) {
      dailyVolume.addCGToken(cgId, vol / markPrice);
    } else {
      dailyVolume.addUSDValue(vol);
    }
  }

  return {
    openInterestAtEnd: data.open_interest,
    dailyVolume
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