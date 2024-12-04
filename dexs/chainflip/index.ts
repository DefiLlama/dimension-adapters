import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const dimensionsEndpoint =
  "https://explorer-service-processor.chainflip.io/defi-llama/dexs";

const fetch = async (options: FetchOptions) => {
  const dimensionsData = await httpGet(
    `${dimensionsEndpoint}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`,
    { headers: { "x-client-id": "defillama" } }
  );

  return {
    timestamp: dimensionsData.timestamp,
    dailyVolume: dimensionsData.dailyVolume,
    totalVolume: dimensionsData.totalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CHAINFLIP]: {
      fetch,
      start: "2023-11-23", // Protocol start date
      runAtCurrTime: true,
      meta: {
        methodology: {
          Volume:
            "Cumulative USD value of swaps executed on the chainflip protocol",
        },
      },
    },
  },
};

export default adapter;
