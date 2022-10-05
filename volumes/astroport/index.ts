import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapter.type";
import { CHAIN } from "../../helper/chains";
import disabledAdapter from "../../helper/disabledAdapter";

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.TERRA]: disabledAdapter,
  },
};

export default adapter;
