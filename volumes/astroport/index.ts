import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapter.type";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.TERRA]: disabledAdapter,
  },
};

export default adapter;
