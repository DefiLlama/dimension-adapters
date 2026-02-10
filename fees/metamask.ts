import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { fetch, configs } from "../aggregators/metamask";
import { getSolanaReceivedDune } from "../helpers/token";
import { CHAIN } from "../helpers/chains";

async function fetchEVM(_a: any, _b: any, options: FetchOptions) {
  return await fetch(options);
}

async function fetchSol(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = await getSolanaReceivedDune({
    options,
    targets: [
      '47YRE7eLAdYzvGqSH1XLg2o8xUtywk7sS5BKv1oR4Y7i',
      'HbBHuvgWoChfztoqz2izLRF5mSoLKQXfU68kueBmhcmL',
    ]
  })
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: 'Total token swap volumes by users using Metamask wallet.',
  Fees: 'All fees paid by users for trading, swapping, bridging in Metamask wallet.',
  Revenue: 'Fees collected by Metamask paid by users for trading, swapping, bridging in Metamask wallet.',
  ProtocolRevenue: 'Fees collected by Metamask paid by users for trading, swapping, bridging in Metamask wallet.',
}

const adapter: Adapter = {
  version: 1,
  fetch: fetchEVM,
  dependencies: [Dependencies.DUNE],
  adapter: {
    ...configs,
    [CHAIN.SOLANA]: {
      fetch: fetchSol,
      start: '2025-08-12',
    },
  },
  methodology,
};

export default adapter;
