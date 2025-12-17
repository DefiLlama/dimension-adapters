// source: https://dune.com/o1_exchange/o1exchange-data

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getSolanaReceived } from '../../helpers/token';

const chainConfig: any = {
  [CHAIN.SOLANA]: {
    start: '2025-07-01',
    treasuryAddress: 'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc',
  },
  [CHAIN.BASE]: {
    start: '2025-07-01',
    treasuryAddress: '0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4',
  },
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) {
    const solanaFees = await getSolanaReceived({
      options,
      targets: [chainConfig[options.chain].treasuryAddress],
      blacklists: [],
    });
    const dailyVolume = solanaFees.clone(100);
    return { dailyFees: solanaFees, dailyUserFees: solanaFees, dailyRevenue: solanaFees, dailyProtocolRevenue: solanaFees, dailyVolume }
  }
  const baseFees = await addTokensReceived({
    options,
    targets: [chainConfig[options.chain].treasuryAddress],
  });
  const dailyVolume = baseFees.clone(100);

  return { dailyFees: baseFees, dailyUserFees: baseFees, dailyRevenue: baseFees, dailyProtocolRevenue: baseFees, dailyVolume }
}

const methodology = {
  Fees: "1% Trading fees paid by users while using o1.exchange.",
  UserFees: "1% Trading fees paid by users while using o1.exchange.",
  Revenue: "All fees are collected by o1.exchange.",
  ProtocolRevenue: "All fees are collected by o1.exchange.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true
};

export default adapter;
