import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const OSTIUM_TRADING_CALLBACKS = '0x7720fc8c8680bf4a1af99d44c6c265a74e9742a9';
const OSTIUM_PAIR_INFOS = '0x3890243a8fc091c626ed26c087a028b46bc9d66c';

const OPENING_FEE_LP_SHARE = 0.3;
const OPENING_FEE_PROTOCOL_SHARE = 0.7;

const VAULT_OPENING_FEE_EVENT = 'event VaultOpeningFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const DEV_FEE_EVENT = 'event DevFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const ORACLE_FEE_EVENT = 'event OracleFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const VAULT_LIQ_FEE_EVENT = 'event VaultLiqFeeCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 amount)';
const FEES_CHARGED_EVENT = 'event FeesCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 rolloverFees, int256 fundingFees)';
const FEES_CHARGED_V2_EVENT = 'event FeesChargedV2(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 rolloverFees, int256 fundingFees)';


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Vault Opening Fee: 30% to LPs (MMV), 70% to protocol
  const openingFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: VAULT_OPENING_FEE_EVENT
  });
  openingFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
    dailySupplySideRevenue.addCGToken("usd-coin", fee * OPENING_FEE_LP_SHARE, METRIC.OPEN_CLOSE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", fee * OPENING_FEE_PROTOCOL_SHARE, METRIC.OPEN_CLOSE_FEES);
  });

  // Liquidation Fee (100% MMV)
  const liqFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: VAULT_LIQ_FEE_EVENT
  });
  liqFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.addCGToken("usd-coin", fee, METRIC.LIQUIDATION_FEES);
  });

  // Oracle Fee (100% protocol)
  const oracleFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: ORACLE_FEE_EVENT
  });
  oracleFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.SERVICE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", fee, METRIC.SERVICE_FEES);
  });

  // Dev Opening Fee (100% protocol)
  const devFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: DEV_FEE_EVENT
  });
  devFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
  });

  // Rollover Fees (100% MMV) - from PairInfos and TradingCallbacks (FeesCharged + FeesChargedV2)
  const [pairInfosLogs, callbacksLogs, callbacksV2Logs] = await Promise.all([
    options.getLogs({ target: OSTIUM_PAIR_INFOS, eventAbi: FEES_CHARGED_EVENT }),
    options.getLogs({ target: OSTIUM_TRADING_CALLBACKS, eventAbi: FEES_CHARGED_EVENT }),
    options.getLogs({ target: OSTIUM_TRADING_CALLBACKS, eventAbi: FEES_CHARGED_V2_EVENT }),
  ]);
  for (const log of [...pairInfosLogs, ...callbacksLogs, ...callbacksV2Logs]) {
    const rolloverFee = Number(log.rolloverFees) / 1e6;
    dailyFees.addCGToken("usd-coin", rolloverFee, METRIC.MARGIN_FEES);
    dailySupplySideRevenue.addCGToken("usd-coin", rolloverFee, METRIC.MARGIN_FEES);
  }


  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.OPEN_CLOSE_FEES]: 'One-time opening fee charged when a position is opened; 30% goes to LPs (MMV), 70% to protocol; dev opening fee is 100% protocol.',
    [METRIC.LIQUIDATION_FEES]: 'Fees charged when a position is liquidated; 100% to MMV.',
    [METRIC.SERVICE_FEES]: 'Flat oracle fee charged when the protocol fetches external price for an action; 100% protocol.',
    [METRIC.MARGIN_FEES]: 'Rollover fees applied to open positions, realized on close; 100% to MMV.',
  },
};

const methodology = {
  Fees: "Gross protocol revenue: opening fees (30% LPs / 70% protocol), liquidation fees, oracle fees, dev fees, rollover fees, and trading spreads (price impact from Dune).",
  ProtocolRevenue: "70% of vault opening fees, 100% of oracle fees, 100% of dev opening fees, 100% of trading spreads.",
  SupplySideRevenue: "30% of vault opening fees (to MMV), 100% of liquidation fees, 100% of rollover fees."
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2025-04-16',
  methodology,
  breakdownMethodology,
  pullHourly: true,
}

export default adapter;