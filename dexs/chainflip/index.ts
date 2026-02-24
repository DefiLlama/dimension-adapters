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
    dailyVolume: dimensionsData.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume:
      "Cumulative USD value of swaps executed on the chainflip protocol",
  },
  adapter: {
    [CHAIN.CHAINFLIP]: {
      fetch,
      start: "2023-11-23", // Protocol start date
    },
  },
};

export default adapter;
