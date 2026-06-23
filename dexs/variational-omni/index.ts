import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";

// strip leading size-multiplier prefixes (e.g. "1000000MOG" -> "MOG", "1000PEPE" -> "PEPE")
// while preserving genuine symbols that start with a digit (1INCH, 0G, 2Z, 4).
const baseAsset = (ticker: string) => ticker.replace(/^(1000000|100000|10000|1000|1M|1K)/i, "");

const fetch = async (options: FetchOptions) => {
  const data = await fetchUrl(URL);

  const dailyVolume = options.createBalances();
  if (!Array.isArray(data.listings) || data.listings.length === 0) {
    throw new Error("Variational response missing listings")
  }
  for (const listing of data.listings) {
    dailyVolume.addUSDValue(Number(listing.volume_24h), { id: baseAsset(String(listing.ticker)), isUSDValue: true });
  }

  return {
    openInterestAtEnd: data.open_interest,
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