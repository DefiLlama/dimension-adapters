// https://api.goldsky.com/api/public/project_clmqdcfcs3f6d2ptj3yp05ndz/subgraphs/kizuna-amm/1.0.0/gn
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_clmqdcfcs3f6d2ptj3yp05ndz/subgraphs/kizuna-amm/1.0.0/gn"
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.MODE],
  fetch,
}

export default adapter;