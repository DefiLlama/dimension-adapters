import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const OSTIUM_TRADING_CALLBACKS = '0x7720fc8c8680bf4a1af99d44c6c265a74e9742a9';
const OSTIUM_PAIR_INFOS = '0x3890243a8fc091c626ed26c087a028b46bc9d66c';

const VAULT_OPENING_FEE_EVENT = 'event VaultOpeningFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const DEV_OPENING_FEE_EVENT = 'event DevFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const ORACLE_FEE_EVENT = 'event OracleFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)';
const ORACLE_FEE_REFUNDED_EVENT = 'event OracleFeeRefunded(uint256 indexed tradeId, address indexed trader, uint16 pairIndex, uint256 amount)';
const VAULT_LIQ_FEE_EVENT = 'event VaultLiqFeeCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 amount)';
const FEES_CHARGED_EVENT = 'event FeesCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 rolloverFees, int256 fundingFees)';
const FEES_CHARGED_V2_EVENT = 'event FeesChargedV2(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, int256 rolloverFees, int256 fundingFees)';


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1.Opening Fee: a.Vault Opening Fee + b.Dev Opening Fee
  // a.Vault Opening Fee (100% MMV)
  const vaultFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: VAULT_OPENING_FEE_EVENT
  });
  vaultFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
    dailySupplySideRevenue.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
  });

  // b.Dev Opening Fee (100% protocol)
  const devFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: DEV_OPENING_FEE_EVENT
  });
  devFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", fee, METRIC.OPEN_CLOSE_FEES);
  });


  // 2.Rollover Fees (100% MMV) - from PairInfos and TradingCallbacks (FeesCharged + FeesChargedV2)
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


  // 3.Liquidation Fee (100% MMV)
  const liqFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: VAULT_LIQ_FEE_EVENT
  });
  liqFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.addCGToken("usd-coin", fee, METRIC.LIQUIDATION_FEES);
  });


  // 4.Oracle Fee (100% protocol)
  const oracleFeeLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: ORACLE_FEE_EVENT
  });
  oracleFeeLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", fee, METRIC.SERVICE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", fee, METRIC.SERVICE_FEES);
  });

  // 5.Oracle Fee Refund (100% protocol)
  const oracleFeeRefundLogs = await options.getLogs({
    target: OSTIUM_TRADING_CALLBACKS,
    eventAbi: ORACLE_FEE_REFUNDED_EVENT
  });
  oracleFeeRefundLogs.map((log: any) => {
    const fee = Number(log.amount) / 1e6;
    dailyFees.addCGToken("usd-coin", -Number(fee), METRIC.SERVICE_FEES);
    dailyProtocolRevenue.addCGToken("usd-coin", -Number(fee), METRIC.SERVICE_FEES);
  });

  // 5.Trading Spreads / Price Impact (100% MMV) - from Dune
  const spreadsResults = await queryDuneSql(options, `
    WITH open_orders AS (
      SELECT order_id, trade_id, executed_at, price_impact_p,
        collateral * leverage / 100 AS notional, trade_notional, 0 AS percentage_closed
      FROM query_5256090
      WHERE executed_at < FROM_UNIXTIME(${options.endTimestamp})
    ),
    close_orders AS (
      SELECT a.order_id, a.trade_id, a.executed_at, a.price_impact_p,
        d.notional, d.trade_notional, a.percentage_closed
      FROM query_5256086 a
      LEFT JOIN (SELECT trade_id, notional, trade_notional FROM open_orders) d ON a.trade_id = d.trade_id
      WHERE a.executed_at < FROM_UNIXTIME(${options.endTimestamp})
    ),
    orders AS (
      SELECT DISTINCT CAST(order_id AS uint256) AS order_id, CAST(trade_id AS uint256) AS trade_id,
        executed_at, price_impact_p/1e18 AS price_impact_p, notional/1e6 AS notional,
        trade_notional/1e18 AS trade_notional, percentage_closed
      FROM (SELECT * FROM open_orders UNION ALL SELECT * FROM close_orders) u
    ),
    step1 AS (
      SELECT *, (100.0 - CAST(percentage_closed AS DOUBLE)) / 100.0 AS remain_fraction FROM orders
    ),
    step2 AS (
      SELECT *, EXP(SUM(LN(remain_fraction)) OVER (PARTITION BY trade_id ORDER BY order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS cumulative_remaining
      FROM step1
    ),
    step3 AS (
      SELECT *, LAG(cumulative_remaining) OVER (PARTITION BY trade_id ORDER BY order_id) - cumulative_remaining AS pct_close
      FROM step2
    )
    SELECT SUM(price_impact_p / 100 * notional * COALESCE(pct_close, 1)) AS total_price_impact
    FROM step3
    WHERE executed_at >= FROM_UNIXTIME(${options.startTimestamp})
      AND executed_at < FROM_UNIXTIME(${options.endTimestamp})
  `);
  if (spreadsResults && spreadsResults.length > 0) {
    const totalSpreads = Number(spreadsResults[0].total_price_impact);
    dailyFees.addCGToken("usd-coin", totalSpreads, 'Trading Spreads');
    dailySupplySideRevenue.addCGToken("usd-coin", totalSpreads, 'Trading Spreads');
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
    [METRIC.OPEN_CLOSE_FEES]: 'One-time opening fee charged when a position is opened; vault opening fee goes to LPs (MMV); dev opening fee goes to protocol.',
    [METRIC.LIQUIDATION_FEES]: 'Fees charged when a position is liquidated; 100% to MMV.',
    [METRIC.SERVICE_FEES]: 'Flat oracle fee charged when the protocol fetches external price for an action; 100% protocol.',
    [METRIC.MARGIN_FEES]: 'Rollover fees applied to open positions, realized on close; 100% to MMV.',
    'Trading Spreads': 'Trading spreads (price impact) charged on position open/close; 100% to MMV.',
  },
};

const methodology = {
  Fees: "Gross protocol revenue: opening fees, liquidation fees, oracle fees, dev fees, rollover fees, and trading spreads.",
  Revenue: "100% of dev opening fees, 100% of oracle fees.",
  ProtocolRevenue: "100% of dev opening fees, 100% of oracle fees.",
  SupplySideRevenue: "100% of vault opening fees (to MMV), 100% of liquidation fees, 100% of rollover fees, 100% of trading spreads."
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2025-04-16',
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
}

export default adapter;
