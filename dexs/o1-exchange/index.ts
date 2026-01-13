// source: https://dune.com/o1_exchange/o1exchange-data

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, getSolanaReceived } from '../../helpers/token';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    '0x1E493E7CF969FD7607A8ACe7198f6C02e5eF85A4',
    '0xc98218Df72975EE1472919d2685e5BD215Baaad4'
  ];

  const dailyFees = await addTokensReceived({ options, targets });
  await getETHReceived({ options, targets, balances: dailyFees, notFromSenders: ['0x4200000000000000000000000000000000000006'] });
  const dailyVolume = dailyFees.clone(100);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume };
}

  
const fetchSol: any = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    'FUzZ2SPwLPAKaHubxQzRsk9K8dXb4YBMR6hTrYEMFFZc',
    'HG73jy6opRQwgTaynUeT6MxX6h3mshNWLPGHme4HdiYy'
  ];

  const dailyFees = await getSolanaReceived({
    blacklists: targets,
    options,
    targets,
  });
  
  const dailyVolume = dailyFees.clone(100);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume }; 
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology: {
    Volume: 'Total trading volume is calculated as fees multiplied by 100, since trading fees are 1% of the volume.',
    Fees: 'User pays 1% fee on each trade',
    UserFees: 'User pays 1% fee on each trade',
    Revenue: 'All trading fees are revenue.',
    ProtocolRevenue: 'All trading fees are revenue collected by o1 exchange.',
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSol,
      start: '2025-07-01',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2025-07-01',
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
