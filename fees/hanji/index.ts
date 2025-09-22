import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchFee } from "../../dexs/hanji";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHERLINK]: {
      fetch: fetchFee(CHAIN.ETHERLINK),
    },
  },
};

export default adapter;
