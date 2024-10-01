import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import disabledAdapter from "../../helpers/disabledAdapter";


const adapters: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ZETA]: {
      fetch: async (timestamp: number) => {return {timestamp, dailyVolume: '0'}},
      start: 1707177600,
    }
  }
}
export default adapters;
