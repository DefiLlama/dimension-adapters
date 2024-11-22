import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import disabledAdapter from "../../helpers/disabledAdapter";


const adapters: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ZETA]: {
      fetch: async (timestamp: number) => {return {timestamp, dailyFees: '0'}},
      start: '2024-02-06',
    }
  }
}
export default adapters;
