import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const factory = "0x0569F2A6B281b139bC164851cf86E4a792ca6e81";

const adapters = getDexVolumeExports({
  chain: CHAIN.SONIC,
  factory,
  fromBlock: 1,
  fetchPairs: true, // assumes factory supports allPairs or getPair logic
  isV2: true,
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: adapters[CHAIN.SONIC].fetch,
      start: async () => 1705708800, // Jan 20, 2025
    },
  },
};

export default adapter;

