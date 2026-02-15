import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://docs.currentx.app
const feesConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch: getUniV2LogAdapter({ factory: '0xC60940F182F7699522970517f6d753A560546937', ...feesConfig }),
      start: "2026-02-05",
    },
  },
};

export default adapter;


