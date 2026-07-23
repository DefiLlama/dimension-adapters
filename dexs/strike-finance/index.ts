import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

export async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const url = `https://app.strikefinance.org/api/analytics/volume?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const { totalVolume } = await fetchURL(url);
  dailyVolume.addCGToken("cardano", Number(totalVolume));

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CARDANO],
  start: "2025-05-16",
};

export default adapter;
