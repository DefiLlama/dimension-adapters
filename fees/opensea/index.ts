import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetch, config } from "./seaport";
import disabledAdapter from "../../helpers/disabledAdapter";
const seaportConfig = { fetch, start: '2022-06-12', }

const adapter: Adapter = {
  version: 2,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.ETHEREUM]: disabledAdapter
    },
    v2: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.ETHEREUM]: disabledAdapter
    },
    seaport: Object.keys(config).reduce((acc, chain) => {
      acc[chain] = seaportConfig
      return acc
    }, {}),
  }
}

export default adapter;
