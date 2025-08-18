import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import getChainData from "./getChainData";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: getChainData,
      start: '2023-10-19',
    }
  },
  version: 2,
}

export default adapter;
