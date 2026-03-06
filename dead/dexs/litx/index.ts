import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";


const adapter: SimpleAdapter = {
  deadFrom: '2026-02-22',
  version: 1,
  adapter: {
    [CHAIN.BSC]: { start: 1687305600 },
    [CHAIN.PULSECHAIN]: { start: 1686096000 },
  },
}

export default adapter;
