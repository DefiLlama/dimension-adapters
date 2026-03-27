import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7'.toLowerCase();

const TOKENS = [
  '0xbb4CdB9CBd36B01bD1cBaEBf2E08E7023b076de6', // WBNB
  '0xe9e7CEA3DedcA698478E4cbC3F78dF2E8C6E2F8B', // BUSD
  '0x55d398326f99059fF775485246999027B3197955', // USDT
  '0x7130d2A12B9BCbFAe4f2634d864A1BCe1767a8D0', // BTCB
  '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: TOKENS,
    targets: [FEE_RECEIVER],
    skipIndexer: true,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const DEV_FEE_DESC = "Developer fees (0.1% per swap) are collected from each trade and sent to the designated fee receiver address.";

const methodology = {
  Fees: "We track fees sent to the fee receiver address which represents the developer commission for every swap executed via our frontend integration.",
  Revenue: DEV_FEE_DESC,
  ProtocolRevenue: DEV_FEE_DESC,
};

const breakdownMethodology = {
  Fees: {
    'Developer Fees': DEV_FEE_DESC,
  },
  Revenue: {
    'Developer Fees': DEV_FEE_DESC,
  },
  ProtocolRevenue: {
    'Developer Fees': DEV_FEE_DESC,
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  fetch,
  start: '2026-03-23',
  methodology,
  breakdownMethodology,
};

export default adapter;