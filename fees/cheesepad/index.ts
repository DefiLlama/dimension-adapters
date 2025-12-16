import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import {
  addTokensReceived,
  getETHReceived,
  nullAddress,
} from '../../helpers/token';

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

const CHAIN_TO_KEY = {
  [CHAIN.BSC]: 'bsc',
};

/**
 * Fetch the daily fees for the Cheesepad protocol, which consists of ERC20 token fees and native fees.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const feeWallet = FEE_WALLETS[options.chain];

  // Track ERC20 token fees
  const tokensReceivedDaily = await addTokensReceived({
    options,
    tokens: CURRENCY_ADDRESSES[options.chain],
    target: feeWallet,
  });

  for (const token of CURRENCY_ADDRESSES[options.chain]) {
    const balancesKeyERC20 = `${
      CHAIN_TO_KEY[options.chain]
    }:${token.toLowerCase()}`;
    const dailyIncomeERC20 =
      tokensReceivedDaily.getBalances()[balancesKeyERC20];
    dailyFees.add(token, dailyIncomeERC20);
  }

  // Track native fees
  const nativeReceivedDaily = await getETHReceived({
    options,
    target: feeWallet,
  });
  const balancesKeyNative = `${
    CHAIN_TO_KEY[options.chain]
  }:${nullAddress.toLowerCase()}`;
  const dailyIncomeNative =
    nativeReceivedDaily.getBalances()[balancesKeyNative];
  dailyFees.add(nullAddress, dailyIncomeNative);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'All fees paid by users by using Cheesepad services.',
    Revenue: 'All fees are revenue.',
    ProtocolRevenue: 'All fees are protocol revenue.',
  },
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2025-11-18' },
  },
};

export default adapter;
