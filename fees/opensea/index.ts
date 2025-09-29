import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetch, config } from "./seaport";
const seaportConfig = { fetch, start: '2022-06-12', }

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: { fetch: async () => ({}), }
    },
    v2: {
      [CHAIN.ETHEREUM]: { fetch: async () => ({}), }
    },
    seaport: Object.keys(config).reduce((acc: any, chain) => {
      acc[chain] = seaportConfig
      return acc
    }, {}),
  }
}

export default adapter;
