import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addTokensReceived, getETHReceived } from '../../helpers/token';

const CURRENCY_ADDRESSES = {
  [CHAIN.BSC]: [
    '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD on BSC
    '0x000Ae314E2A2172a039B26378814C252734f556A', // ASTER on BSC
  ],
};

const FEE_WALLETS: Record<string, string> = {
  [CHAIN.BSC]: '0xEa99f38fC47bD683E328c8ff013244032bca9961',
};


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await addTokensReceived({
    options,
    tokens: CURRENCY_ADDRESSES[options.chain],
    target: FEE_WALLETS[options.chain],
    balances: dailyFees,
  });
  await getETHReceived({
    options,
    target: FEE_WALLETS[options.chain],
    balances: dailyFees,
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
  chains: [CHAIN.BSC],
  start: '2025-11-18',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'fees users paid for using Cheesepad services.',
    Revenue: 'fees users paid for using Cheesepad services.',
    ProtocolRevenue: 'fees users paid for using Cheesepad services.',
  },
};

export default adapter;
