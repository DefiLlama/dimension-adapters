import { FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTradeVolume, DELPHI_START, getTrades } from "../helpers/delphi";

const fetch: FetchV2 = async (options) => {
  const dailyVolume = options.createBalances();
  const { buys, sells } = await getTrades(options);

  addTradeVolume(dailyVolume, buys, sells);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.GENSYN],
  start: DELPHI_START,
  methodology: {
    Volume: "Cash exchanged across both sides of Delphi prediction markets. Volume is the sum of buy tokens in and sell tokens out.",
  },
};

export default adapter;
