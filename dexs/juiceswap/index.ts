import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://docs.juiceswap.com/faq.html#fees-and-economics
const feesConfig = {
  userFeesRatio: 1,
  revenueRatio: 0, // 100% LP fees
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CITREA]: {
      fetch: getUniV3LogAdapter({ factory: '0xd809b1285aDd8eeaF1B1566Bf31B2B4C4Bba8e82', ...feesConfig }),
      start: "2026-01-29",
    },
  },
};

export default adapter;
