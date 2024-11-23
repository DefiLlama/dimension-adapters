import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetch } from "./seaport";
import disabledAdapter from "../../helpers/disabledAdapter";

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
    seaport: {
      [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: '2022-06-12',
      },
    }
  }
}

export default adapter;
