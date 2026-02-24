import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    classic: {
      [CHAIN.KAVA]: {
        fetch: getUniV2LogAdapter({ factory: '0xc449665520C5a40C9E88c7BaDa149f02241B1f9F'}),
        start: '2022-08-05',
      },
    },
    "stable-amm": {
      [CHAIN.KAVA]: {
        fetch: () => ({} as any),
        start: '2022-06-30',
        deadFrom: "2025-03-19",
      },
    },
  }
}

export default adapter;
