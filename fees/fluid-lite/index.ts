import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";
import BigNumber from 'bignumber.js';
import ADDRESSES from '../../helpers/coreAssets.json'

const iETHv2_VAULT = "0xA0D3707c569ff8C87FA923d3823eC5D81c98Be78";
const stETHAddress = ADDRESSES.ethereum.STETH;
const EventLogCollectRevenue = 'event LogCollectRevenue(uint256 amount, address indexed to)';

const USDLiteVAULT = '0x273DA948ACa9261043fbdb2a857BC255ECC29012';
const USDC = ADDRESSES.ethereum.USDC;
const EventWithdrawFee = 'event LogWithdrawFee(address indexed owner, uint256 fee)';
// USD Lite vault deployed at block 24616005 (2026-03-08 23:22 UTC), its strategy handler at block 24616020
const USD_LITE_START = 1773014400; // 2026-03-09 00:00 UTC
// Fluid Lending fUSDC: the USD Lite vault keeps its idle USDC here, and fees/fluid already counts that interest
const fUSDC = '0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33';

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [currentRevenueValue, startRevenueValue] = await Promise.all([
    options.api.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),

    options.fromApi.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),
  ]);

  if (options.startTimestamp >= USD_LITE_START) {
    const withdrawFeeLogs = await options.getLogs({
      target: USDLiteVAULT,
      eventAbi: EventWithdrawFee,
    });

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

    const withdrawFeeAmount: BigNumber = withdrawFeeLogs.reduce(
      (acc, log) => acc.plus(new BigNumber(log.fee)),
      new BigNumber(0)
    );

    dailyRevenue.add(USDC, withdrawFeeAmount.toFixed(), 'USD Lite Vault Withdraw Fees');

    // Depositor yield: growth of convertToAssets() on the share supply at the start of the window
    const usdLiteShares = await options.fromApi.call({ abi: 'erc20:totalSupply', target: USDLiteVAULT });
    const [startUsdLiteAssets, endUsdLiteAssets, idleFTokenShares, startFTokenAssets, endFTokenAssets] = await Promise.all([
      options.fromApi.call({ abi: 'function convertToAssets(uint256) view returns (uint256)', target: USDLiteVAULT, params: [usdLiteShares] }),
      options.api.call({ abi: 'function convertToAssets(uint256) view returns (uint256)', target: USDLiteVAULT, params: [usdLiteShares] }),
      options.fromApi.call({ abi: 'erc20:balanceOf', target: fUSDC, params: [USDLiteVAULT] }),
      options.fromApi.call({ abi: 'function convertToAssets(uint256) view returns (uint256)', target: fUSDC, params: [1e12] }),
      options.api.call({ abi: 'function convertToAssets(uint256) view returns (uint256)', target: fUSDC, params: [1e12] }),
    ]);
    // Fluid Lending interest on the vault's idle fUSDC is left out: fees/fluid already books it, and both listings sit under parent#fluid
    const fUSDCInterest = (BigInt(endFTokenAssets) - BigInt(startFTokenAssets)) * BigInt(idleFTokenShares) / BigInt(1e12);
    const usdLiteDepositorYield = BigInt(endUsdLiteAssets) - BigInt(startUsdLiteAssets) - fUSDCInterest;
    dailySupplySideRevenue.add(USDC, usdLiteDepositorYield.toString(), 'USD Lite Vault Yield To Depositors');
  }

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

  // Depositor yield: growth of exchangePrice() on the share supply at the start of the window.
  // exchangePrice() is already net of the performance fee booked above (revenueFeePercentage() = 200000 on a 1e6 scale)
  const [startExchangePrice, endExchangePrice, iETHv2Shares] = await Promise.all([
    options.fromApi.call({ abi: 'function exchangePrice() view returns (uint256)', target: iETHv2_VAULT }),
    options.api.call({ abi: 'function exchangePrice() view returns (uint256)', target: iETHv2_VAULT }),
    options.fromApi.call({ abi: 'erc20:totalSupply', target: iETHv2_VAULT }),
  ]);
  const iETHv2DepositorYield = (BigInt(endExchangePrice) - BigInt(startExchangePrice)) * BigInt(iETHv2Shares) / BigInt(1e18);
  dailySupplySideRevenue.add(stETHAddress, iETHv2DepositorYield.toString(), 'ETH Lite Vault Yield To Depositors');

  const dailyFees = dailyRevenue.clone();
  dailyFees.add(dailySupplySideRevenue);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Total yield generated by the Lite vaults: the share of yield passed to depositors plus the protocol fees. ETH Lite Vault (iETHv2) charges a 20% performance fee on vault yields and an additional 0.05% exit fee, collected by the Instadapp treasury. USD Lite Vault (fLiteUSD) charges a 0.05% withdrawal fee, retained by the vault. USD vault reserves which increases when vault yield exceeds the fixed rate paid to depositors. Interest the USD Lite Vault earns on its idle USDC in Fluid Lending is excluded, because the Fluid Lending listing already counts it.',
    Revenue: 'ETH Lite Vault performance and exit fees are collected by the Instadapp treasury. USD Lite Vault withdrawal fees are retained by the vault as protocol revenue and recognized during reconciliation. USD Lite Vault reserves which increases when vault yield exceeds the fixed rate paid to depositors are recognized as protocol revenue.',
    SupplySideRevenue: 'Yield passed to Lite vault depositors through the growth of the vault share price, excluding the interest the USD Lite Vault earns on its idle USDC in Fluid Lending.',
  },
  breakdownMethodology: {
    Fees: {
      'ETH Lite Vaults Fees': 'ETH Lite Vault (iETHv2) charges a 20% performance fee on vault yields and an additional 0.05% exit fee.',
      'USD Lite Vaults Fees': 'USD Lite Vault (fLiteUSD) vault reserves which increases when vault yield exceeds the fixed rate paid to depositors.',
      'USD Lite Vault Withdraw Fees': 'USD Lite Vault (fLiteUSD) charges a 0.05% withdrawal fee on withdrawals and redemptions and recognized during reconciliation.',
      'ETH Lite Vault Yield To Depositors': 'Yield passed to ETH Lite Vault (iETHv2) depositors after the performance fee, from the growth of the vault exchange price on its share supply.',
      'USD Lite Vault Yield To Depositors': 'Yield passed to USD Lite Vault (fLiteUSD) depositors, from the growth of the vault share price on its share supply, less the interest the vault earns on its idle USDC in Fluid Lending, which the Fluid Lending listing already counts.',
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
    SupplySideRevenue: {
      'ETH Lite Vault Yield To Depositors': 'Yield passed to ETH Lite Vault (iETHv2) depositors after the performance fee, from the growth of the vault exchange price on its share supply.',
      'USD Lite Vault Yield To Depositors': 'Yield passed to USD Lite Vault (fLiteUSD) depositors, from the growth of the vault share price on its share supply, less the interest the vault earns on its idle USDC in Fluid Lending, which the Fluid Lending listing already counts.',
    },
  },
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-02-13',
  allowNegativeValue: true, // USD vault reserves can yield negative values, and a vault share price can fall on a loss
  doublecounted: true, // iETHv2 yield is mostly stETH staking rewards, which the Lido listing already counts
};

export default adapter;
