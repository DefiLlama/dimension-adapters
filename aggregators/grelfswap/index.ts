import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const fetchVolume = async (options: FetchOptions) => {
  const response = await fetchUrl(
    "https://grelfswap.com/api/defillama/volume-interval?startTimestamp=" +
      options.startTimestamp +
      "&endTimestamp=" +
      options.endTimestamp,
  );

  if (!response || !Number.isFinite(response.volumeUsd) || response.volumeUsd < 0) {
    throw new Error(
      "No valid GrelfSwap volume for " + options.startTimestamp + "-" + options.endTimestamp,
    );
  }

  return { dailyVolume: response.volumeUsd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetchVolume,
      start: "2025-11-07",
    },
  },
};

export default adapter;
