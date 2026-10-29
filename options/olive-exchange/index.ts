import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { noTpSlColumns, queryOliveEvents, sizeTpSlFills, START, tpSlRowsSql } from "../../helpers/oliveExchange";

// One contract is one unit of the underlying, quantities are contracts × 1e6 and prices USD × 1e6, so
// quantity × price / 1e6 is notional in USD × 1e6. Puts are valued at their strike, calls and choosers at spot.
const notional = (quantity: string, spot: string) => `ROUND(${quantity} * IFF(option_type = 1, strike_price, ${spot}) / 1e6)`;

const FEE_LABEL = 'Options Trading Fees';

const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'OptionPositionOpened', 'LimitOptionOrderExecuted', 'OptionPositionClosed', 'ChooserPositionOpened',
    'LimitChooserOrderExecuted', 'ChooserPositionClosed', 'ChooserTpSlOrderExecuted', 'TpSlOrderExecuted',
  ], `
    notional_rows AS (
      -- trades only: buys and sell-backs. Exercises, expiry settlements and chooser conversions are not trades
      -- and are left out (the contracts were already counted when bought)
      SELECT ${notional('remaining_quantity', 'entry_spot_price')} AS notional_usd FROM OptionPositionOpened
      UNION ALL SELECT ${notional('remaining_quantity', 'execution_spot_price')} FROM LimitOptionOrderExecuted
      UNION ALL SELECT ${notional('closed_quantity', 'current_price')} FROM OptionPositionClosed
      UNION ALL SELECT ROUND(quantity * entry_spot_price / 1e6) FROM ChooserPositionOpened
      UNION ALL SELECT ROUND(quantity * entry_spot_price / 1e6) FROM LimitChooserOrderExecuted
      UNION ALL SELECT ROUND(closed_quantity * current_price / 1e6) FROM ChooserPositionClosed
      UNION ALL SELECT ROUND(closed_quantity * current_price / 1e6) FROM ChooserTpSlOrderExecuted
    ),
    premium_rows AS (
      -- premiums buyers paid and premiums the pool paid for contracts sold back, before fees, USD × 1e6
      SELECT remaining_premium_total_usd AS premium_usd FROM OptionPositionOpened
      UNION ALL SELECT remaining_premium_total_usd FROM LimitOptionOrderExecuted
      UNION ALL SELECT close_premium_usd FROM OptionPositionClosed
      UNION ALL SELECT remaining_premium_total_usd FROM ChooserPositionOpened
      UNION ALL SELECT remaining_premium_total_usd FROM LimitChooserOrderExecuted
      UNION ALL SELECT close_value_usd FROM ChooserPositionClosed
      UNION ALL SELECT close_value_usd FROM ChooserTpSlOrderExecuted
    ),
    fee_rows AS (
      -- option and chooser trading fees in USD × 1e6, each with the share Olive took
      SELECT protocol_fee_usd AS fee, bps FROM OptionPositionOpened
      UNION ALL SELECT protocol_fee_usd, bps FROM LimitOptionOrderExecuted
      UNION ALL SELECT protocol_fee_usd, bps FROM OptionPositionClosed
      UNION ALL SELECT protocol_fee_usd, bps FROM ChooserPositionOpened
      UNION ALL SELECT protocol_fee_usd, bps FROM LimitChooserOrderExecuted
      UNION ALL SELECT protocol_fee_usd, bps FROM ChooserPositionClosed
      UNION ALL SELECT protocol_fee_usd, bps FROM ChooserTpSlOrderExecuted
      -- TP/SL fills: contract_type 1 is an option (perp and future ones are in dexs/olive-exchange)
      UNION ALL SELECT trade_fees_paid_usd, bps FROM TpSlOrderExecuted WHERE contract_type = 1
    )`, `
    SELECT 'notional' AS metric, SUM(notional_usd)::VARCHAR AS usd, NULL AS company, ${noTpSlColumns} FROM notional_rows
    UNION ALL SELECT 'premium', SUM(premium_usd)::VARCHAR, NULL, ${noTpSlColumns} FROM premium_rows
    UNION ALL SELECT 'fees', SUM(fee)::VARCHAR, SUM(FLOOR(fee * bps / 10000))::VARCHAR, ${noTpSlColumns} FROM fee_rows
    UNION ALL ${tpSlRowsSql([1], 'NULL, NULL, NULL')}
  `);

  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    if (!row.metric || !row.usd) continue;
    const usd = Number(row.usd) / 1e6;
    if (row.metric === 'notional') dailyNotionalVolume.addUSDValue(usd);
    else if (row.metric === 'premium') dailyPremiumVolume.addUSDValue(usd);
    else {
      // each fee is split on chain by the event's own company_fee_share_bps (2500 = 25% in every pool since
      // launch): floor(fee × bps / 10000) to Olive, the rest stays in the pool for its liquidity providers
      const company = Number(row.company) / 1e6;
      dailyFees.addUSDValue(usd, FEE_LABEL);
      dailyRevenue.addUSDValue(company, `${FEE_LABEL} To Olive`);
      dailySupplySideRevenue.addUSDValue(usd - company, `${FEE_LABEL} To LPs`);
    }
  }
  // option take-profit and stop-loss sells record the share of the position they sold: the contracts sold come
  // from the position's history, valued like a sell-back (puts at their strike, calls at spot)
  for (const fill of await sizeTpSlFills(options, rows)) {
    const price = fill.optionType === 1 && fill.strike !== undefined ? fill.strike : fill.spot;
    dailyNotionalVolume.addUSDValue(Number(fill.quantity * price) / 1e12);
    // the trigger fires on the premium: contracts sold × premium per contract
    dailyPremiumVolume.addUSDValue(Number(fill.quantity * fill.executedPrice) / 1e12);
  }
  return {
    dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
 // pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    NotionalVolume: "Notional of every option and chooser trade (market and limit buys, sell-backs, and take-profit and stop-loss sells) at the execution spot price, with puts valued at their strike. Exercises, expiry settlements and chooser conversions are not trades and are not counted.",
    PremiumVolume: "Premiums of option and chooser trades before fees: what buyers paid (market and limit buys) and what the pool paid for contracts sold back (sell-backs and take-profit and stop-loss sells).",
    Fees: "Fees option and chooser traders pay Olive on opening and closing positions (market and limit orders, sell-backs and take-profit and stop-loss sells). Liquidity deposit and withdrawal fees on the pools Olive's options and perps share are counted in Olive's perps listing.",
    UserFees: "All option and chooser trading fees, paid by Olive's option traders.",
    Revenue: "Olive's share of option and chooser trading fees: 25% of each fee since launch, set per pool on chain.",
    ProtocolRevenue: "Olive's share of option and chooser trading fees, collected into each pool's protocol fee account.",
    SupplySideRevenue: "The liquidity providers' share of option and chooser trading fees (75% since launch), kept by the pools.",
  },
  breakdownMethodology: {
    Fees: {
      [FEE_LABEL]: "Fees on opening and closing options and chooser options (market and limit orders, sell-backs and TP/SL sells).",
    },
    UserFees: {
      [FEE_LABEL]: "Paid by option and chooser traders.",
    },
    Revenue: {
      [`${FEE_LABEL} To Olive`]: "Olive's share of option and chooser fees.",
    },
    ProtocolRevenue: {
      [`${FEE_LABEL} To Olive`]: "Olive's share of option and chooser fees.",
    },
    SupplySideRevenue: {
      [`${FEE_LABEL} To LPs`]: "The pool's share of option and chooser fees.",
    },
  },
};

export default adapter;
