import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const feeWallets = [
  '0x2fE8D03556FDb94A0ce1e46bbb5945794a50a046',
];

const feeToken = '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b';

// bankr bot revenue come from membership subs in $BNKR token
// no trading fees for now
const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: feeWallets,
    token: feeToken,
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2026-01-01',
  chains: [CHAIN.BASE],
  methodology: {
    Fees: 'All fees come from membership subscriptions paid in $BNKR tokens.',
    Revenue: 'All fees are collected as revenue by Bankr Bot.',
    ProtocolRevenue: 'All fees are collected as revenue by Bankr Bot.',
  }
};

export default adapter;
