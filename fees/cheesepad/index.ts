import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addTokensReceived, getETHReceived } from '../../helpers/token';

const CURRENCY_ADDRESSES = {
  [CHAIN.BSC]: [
    ADDRESSES.bsc.USDT, // USDT on BSC
    ADDRESSES.bsc.USDC, // USDC on BSC
    ADDRESSES.bsc.BUSD, // BUSD on BSC
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
  pullHourly: true,
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
