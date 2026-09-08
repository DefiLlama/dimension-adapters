import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { fetch as fetchEvmBase, configs } from "../aggregators/metamask";
import { getSolanaReceived } from "../helpers/token";
import { CHAIN } from "../helpers/chains";

const LABEL = 'Wallet Service Fees'

// EVM path reuses the shared aggregator fetch, then relabels the fee as a
// wallet trading fee (kept here so the shared aggregator output is untouched).
async function fetchEvm(options: FetchOptions) {
  const res: any = await fetchEvmBase(options)
  const dailyFees = res.dailyFees.clone(1, LABEL)
  return {
    dailyVolume: res.dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

async function fetchSol(options: FetchOptions) {
  const received = await getSolanaReceived({
    options,
    targets: [
      '47YRE7eLAdYzvGqSH1XLg2o8xUtywk7sS5BKv1oR4Y7i',
      'HbBHuvgWoChfztoqz2izLRF5mSoLKQXfU68kueBmhcmL',
    ]
  })
  const dailyFees = received.clone(1, LABEL)

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

const breakdownMethodology = {
  Fees: {
    [LABEL]: 'Fees paid by users for trading, swapping and bridging in the MetaMask wallet.',
  },
  Revenue: {
    [LABEL]: 'Trading fees collected by MetaMask.',
  },
  ProtocolRevenue: {
    [LABEL]: 'Trading fees collected by MetaMask.',
  },
}

const adapter: Adapter = {
  version: 2,
  fetch: fetchEvm,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    ...configs,
    [CHAIN.SOLANA]: {
      fetch: fetchSol,
      start: '2025-08-12',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
