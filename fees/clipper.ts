import { SimpleAdapter } from "../adapters/types";
import { fetchClipperDexs } from "../dexs/clipper";
import { CHAIN } from "../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchClipperDexs,
      start: '2022-08-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchClipperDexs,
      start: '2022-06-29',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchClipperDexs,
      start: '2023-08-02',
    },
     [CHAIN.POLYGON]: {
      fetch: fetchClipperDexs,
      start: '2022-04-20',
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetchClipperDexs,
      start: '2022-08-05',
    },
  }
}

export default adapter;