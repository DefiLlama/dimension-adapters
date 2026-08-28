import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

// Fee recipient addresses
const TREASURY_FEES_RECIPIENT = '0x9EBBb3d59d53D6aD3FA5464f36c2E84aBb7cf5c1';
const VESDT_FEE_RECIPIENT = '0x1fE537BD59A221854a53a5B7a81585B572787fce';
const LIQUIDITY_FEES_RECIPIENT = '0x576D7AD8eAE92D9A972104Aac56c15255dDBE080';

const fetch = async (options: FetchOptions) => {
  const protocolFees = await addTokensReceived({
    options,
    targets: [TREASURY_FEES_RECIPIENT],
  });

  const holdersFees = await addTokensReceived({
    options,
    targets: [VESDT_FEE_RECIPIENT],
  });

  const bribesRevenue = await addTokensReceived({
    options,
    targets: [LIQUIDITY_FEES_RECIPIENT],
  });

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addBalances(protocolFees, 'Staking Rewards');
  dailyFees.addBalances(holdersFees, 'Staking Rewards');
  dailyFees.addBalances(bribesRevenue, 'Bribes Rewards');

  dailyProtocolRevenue.addBalances(protocolFees, 'Staking Rewards To Protocol');

  dailyHoldersRevenue.addBalances(holdersFees, 'Staking Rewards To Holders');
  dailyHoldersRevenue.addBalances(bribesRevenue, 'Bribes Revenue');

  dailyRevenue.addBalances(protocolFees, 'Staking Rewards To Protocol');
  dailyRevenue.addBalances(holdersFees, 'Staking Rewards To Holders');
  dailyRevenue.addBalances(bribesRevenue, 'Bribes Revenue');

  return {
    dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-01-01',
    }
  },
  methodology: {
    Fees: "Staking rewards earned by StakeDAO, veSDT holders, and liquidity incentives distributed through vote incentives.",
    Revenue: "Staking rewards earned by StakeDAO and veSDT holders plus liquidity incentives distributed through vote incentives.",
    ProtocolRevenue: "Staking rewards earned by StakeDAO treasury.",
    HoldersRevenue: "Staking rewards earned by veSDT holders plus liquidity incentives distributed through vote incentives.",
  },
  breakdownMethodology: {
    Fees: {
      'Staking Rewards': 'Staking rewards sent to the StakeDAO treasury fee recipient and veSDT fee recipient.',
      'Bribes Rewards': 'Liquidity incentives sent to the StakeDAO liquidity fee recipient.',
    },
    Revenue: {
      'Staking Rewards To Protocol': 'Staking rewards sent to the StakeDAO treasury fee recipient.',
      'Staking Rewards To Holders': 'Staking rewards sent to the veSDT fee recipient.',
      'Bribes Revenue': 'Liquidity incentives distributed through vote incentives.',
    },
    ProtocolRevenue: {
      'Staking Rewards To Protocol': 'Staking rewards sent to the StakeDAO treasury fee recipient.',
    },
    HoldersRevenue: {
      'Staking Rewards To Holders': 'Staking rewards sent to the veSDT fee recipient.',
      'Bribes Revenue': 'Liquidity incentives distributed through vote incentives.',
    },
  }
};

export default adapter;
