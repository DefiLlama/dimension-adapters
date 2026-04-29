import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addTokensReceived } from '../helpers/token';
import { nullAddress } from '../helpers/token';

// Revenue wallet set verified against the Illuvium Discord treasury/address notes shared by the team.
// IMX addresses:
// - 0x9989818AE063f715a857925E419bA4B65b793d99: IlluviDex trading fees and sales revenue
// - 0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177: revenue tokens received from Unified Fuel purchases
// The older Fuel Exchange revenue wallet 0x2208850ea5569617d5350f8cf681031102c1d931 is intentionally not tracked here.
// The REVDIS contract 0xaa2e727ba59b4fea24d0db4e49a392fdc3e8e778 is also intentionally not tracked here,
// because it is used for revenue distribution rather than fee collection.
const IMX_FEE_COLLECTORS = [
  "0x9989818AE063f715a857925E419bA4B65b793d99",
  "0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177",
];

// Ethereum address verified against the same Illuvium Discord notes:
// - 0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177: multichain wallet used for Unified Fuel-related payments
// On Ethereum we track both ERC20 inflows and native ETH balance delta for this address.
const ETHEREUM_FEE_COLLECTOR = "0xBB7d2d46352AD21e4Dfc07dB90C9Bd1ec2dBb177";

const fetchImxFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: IMX_FEE_COLLECTORS,
    skipIndexer: true,
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const fetchEthereumFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: ETHEREUM_FEE_COLLECTOR,
    skipIndexer: true,
  })

  const preBalance = await options.fromApi.sumTokens({
    token: nullAddress,
    owner: ETHEREUM_FEE_COLLECTOR,
  }) as any

  const postBalance = await options.toApi.sumTokens({
    token: nullAddress,
    owner: ETHEREUM_FEE_COLLECTOR,
  }) as any

  dailyFees.addBalances(postBalance)
  dailyFees.subtract(preBalance)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.IMMUTABLEX]: {
      fetch: fetchImxFees,
      start: '2026-02-09',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereumFees,
      start: '2025-03-26',
    }
  },
  methodology: {
    Fees: "On Immutable zkEVM, fees are measured as all ERC20 transfers into the verified IlluviDex and Unified Fuel revenue wallets. On Ethereum, fees are measured as all ERC20 transfers into the verified Unified Fuel revenue wallet plus the wallet's net ETH inflow over the period.",
    Revenue: "All assets received by these verified revenue-collection wallets are counted as protocol revenue. Distribution contracts such as REVDIS and deprecated revenue wallets are excluded.",
  }
}

export default adapter;
