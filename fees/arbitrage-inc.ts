import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: [
      '0xbb4CdB9CBd36B01bD1cBaEBf2E08E7023b076de6',
      '0xe9e7CEA3DedcA698478E4cbC3F78dF2E8C6E2F8B',
      '0x55d398326f99059fF775485246999027B3197955',
      '0x7130d2A12B9BCbFAe4f2634d864A1BCe1767a8D0',
      '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    ],
    targets: [FEE_RECEIVER],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.BSC],
  fetch,
  start: '2024-09-01',
  methodology: {
    Fees: "We track fees sent to the fee receiver address which represents the developer commission for every arbitrage executed via our frontend integration.",
    Revenue: "Developer fees are collected from each trade and sent to the designated fee receiver address.",
  },
};

export default adapter;