import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";
import BigNumber from 'bignumber.js';
import ADDRESSES from '../../helpers/coreAssets.json'

const iETHv2_VAULT = "0xA0D3707c569ff8C87FA923d3823eC5D81c98Be78";
const stETHAddress = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const EventLogCollectRevenue = 'event LogCollectRevenue(uint256 amount, address indexed to)';

const USDLiteVAULT = '0x273DA948ACa9261043fbdb2a857BC255ECC29012';
const USDC = ADDRESSES.ethereum.USDC;
const EventWithdrawFee = 'event LogWithdrawFee(address indexed owner, uint256 fee)';

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const [currentRevenueValue, startRevenueValue, withdrawFeeLogs] = await Promise.all([
    options.api.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),

    options.fromApi.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),

    options.getLogs({
      target: USDLiteVAULT,
      eventAbi: EventWithdrawFee,
    }),
  ]);

  const strategyHandlerAddress = await options.api.call({
    abi: "function getStrategyHandler() view returns (address)",
    target: USDLiteVAULT,
  });

  const [currentReservesUSD, startReservesUSD] = await Promise.all([
    options.api.call({
      abi: "function getReserves() view returns (int256)",
      target: strategyHandlerAddress,
    }),
    options.fromApi.call({
      abi: "function getReserves() view returns (int256)",
      target: strategyHandlerAddress,
    }),
  ]);

  const reservesDelta = Number(currentReservesUSD) - Number(startReservesUSD);
  dailyRevenue.add(USDC, reservesDelta, "USD Lite Vaults Fees");

  // Add revenue delta to daily revenue
  const revenueDelta = Number(currentRevenueValue) - Number(startRevenueValue)
  dailyRevenue.add(stETHAddress, revenueDelta, 'ETH Lite Vaults Fees');

  const collectRevenueLogs = await options.getLogs({
    target: iETHv2_VAULT,
    onlyArgs: true,
    eventAbi: EventLogCollectRevenue,
    skipCacheRead: true,
    skipIndexer: true,
    // More resource-intensive but prevents logs from being cached.
    // Currently, the adapter is updated every hour.
    // In case of an error within a given time range for some reasons, the next sequence
    // can likely fix the issue naturally if it retries fetching all the logs
  });

  // If revenue is collected in this timeframe, add the collected amount to daily fees
  const collectedRevenueAmount: BigNumber = collectRevenueLogs.reduce(
    (acc, log) => acc.plus(new BigNumber(log[0])),
    new BigNumber(0)
  );

  dailyRevenue.add(stETHAddress, collectedRevenueAmount.toFixed(), 'ETH Lite Vaults Fees');

  const withdrawFeeAmount: BigNumber = withdrawFeeLogs.reduce(
    (acc, log) => acc.plus(new BigNumber(log.fee)),
    new BigNumber(0)
  );

  dailyRevenue.add(USDC, withdrawFeeAmount.toFixed(), 'USD Lite Vault Withdraw Fees');

  return { dailyFees: dailyRevenue, dailyRevenue }
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'ETH Lite Vault (iETHv2) charges a 20% performance fee on vault yields and an additional 0.05% exit fee, collected by the Instadapp treasury. USD Lite Vault (fLiteUSD) charges a 0.05% withdrawal fee, retained by the vault. USD vault reserves which increases when vault yield exceeds the fixed rate paid to depositors.',
    Revenue: 'ETH Lite Vault performance and exit fees are collected by the Instadapp treasury. USD Lite Vault withdrawal fees are retained by the vault as protocol revenue and recognized during reconciliation. USD Lite Vault reserves which increases when vault yield exceeds the fixed rate paid to depositors are recognized as protocol revenue.',
  },
  breakdownMethodology: {
    Fees: {
      'ETH Lite Vaults Fees': 'ETH Lite Vault (iETHv2) charges a 20% performance fee on vault yields and an additional 0.05% exit fee.',
      'USD Lite Vaults Fees': 'USD Lite Vault (fLiteUSD) vault reserves which increases when vault yield exceeds the fixed rate paid to depositors.',
      'USD Lite Vault Withdraw Fees': 'USD Lite Vault (fLiteUSD) charges a 0.05% withdrawal fee on withdrawals and redemptions and recognized during reconciliation.',
    },
    Revenue: {
      'ETH Lite Vaults Fees': 'ETH Lite Vault performance and exit fees are collected as revenue and transferred to the Instadapp treasury.',
      'USD Lite Vaults Fees': 'USD Lite Vault reserves which increases when vault yield exceeds the fixed rate paid to depositors are recognized as protocol revenue.',
      'USD Lite Vault Withdraw Fees': 'USD Lite Vault withdrawal fees are retained by the vault as protocol revenue and recognized during reconciliation.',
    },
    ProtocolRevenue: {
      'ETH Lite Vaults Fees': 'ETH Lite Vault performance and exit fees are collected as revenue and transferred to the Instadapp treasury.',
      'USD Lite Vaults Fees': 'USD Lite Vault reserves which increases when vault yield exceeds the fixed rate paid to depositors are recognized as protocol revenue.',
      'USD Lite Vault Withdraw Fees': 'USD Lite Vault withdrawal fees are retained by the vault as protocol revenue and recognized during reconciliation.',
    },
  },
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-02-13',
  allowNegativeValue: true, // USD vault reserves can yield negative values
};

export default adapter;
