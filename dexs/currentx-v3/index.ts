import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://docs.currentx.app
const feesConfig = {
  userFeesRatio: 0.75,
  revenueRatio: 0.25,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch: getUniV3LogAdapter({ factory: '0x09cF8A0b9e8C89bff6d1ACbe1467e8E335Bdd03E', ...feesConfig }),
      start: "2026-02-05",
    },
  },
};

export default adapter;


