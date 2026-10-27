import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { noTpSlColumns, queryOliveEvents, sizeTpSlFills, START, tpSlRowsSql } from "../../fees/olive-exchange/shared";

// One contract is one unit of the underlying, quantities are contracts × 1e6 and prices USD × 1e6, so
// quantity × price / 1e6 is notional in USD × 1e6. Puts are valued at their strike, calls and choosers at spot.
const notional = (quantity: string, spot: string) => `ROUND(${quantity} * IFF(option_type = 1, strike_price, ${spot}) / 1e6)`;

const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'OptionPositionOpened', 'LimitOptionOrderExecuted', 'OptionPositionClosed', 'OptionPositionExercised',
    'OptionPositionAutoExercised', 'ChooserPositionOpened', 'LimitChooserOrderExecuted', 'ChooserPositionClosed',
    'ChooserTpSlOrderExecuted', 'ChooserChosen', 'ChooserConverted', 'TradeRequestFilled', 'TpSlOrderExecuted',
  ], `
    notional_rows AS (
      SELECT IFF(option_type = 1, 'Put Options', 'Call Options') AS product, ${notional('remaining_quantity', 'entry_spot_price')} AS notional_usd FROM OptionPositionOpened
      UNION ALL SELECT IFF(option_type = 1, 'Put Options', 'Call Options'), ${notional('remaining_quantity', 'execution_spot_price')} FROM LimitOptionOrderExecuted
      UNION ALL SELECT IFF(option_type = 1, 'Put Options', 'Call Options'), ${notional('closed_quantity', 'current_price')} FROM OptionPositionClosed
      -- a holder's exercise records no spot: the price the fill in the same transaction used
      UNION ALL SELECT IFF(e.option_type = 1, 'Put Options', 'Call Options'),
        ROUND(e.exercised_quantity * IFF(e.option_type = 1, e.strike_price, COALESCE(f.fill_price, e.strike_price)) / 1e6)
        FROM OptionPositionExercised e
        LEFT JOIN (SELECT txn_id, pool, MAX(fill_price) AS fill_price FROM TradeRequestFilled GROUP BY txn_id, pool) f ON f.txn_id = e.txn_id AND f.pool = e.pool
      -- expiry auto-exercise at the settlement price (USD × 1e9), in the money or not
      UNION ALL SELECT IFF(option_type = 1, 'Put Options', 'Call Options'), ${notional('auto_exercised_quantity', 'ROUND(settlement_underlying_price_e9 / 1000)')} FROM OptionPositionAutoExercised
      UNION ALL SELECT 'Chooser Options', ROUND(quantity * entry_spot_price / 1e6) FROM ChooserPositionOpened
      UNION ALL SELECT 'Chooser Options', ROUND(quantity * entry_spot_price / 1e6) FROM LimitChooserOrderExecuted
      UNION ALL SELECT 'Chooser Options', ROUND(closed_quantity * current_price / 1e6) FROM ChooserPositionClosed
      UNION ALL SELECT 'Chooser Options', ROUND(closed_quantity * current_price / 1e6) FROM ChooserTpSlOrderExecuted
      -- an automatic choice settles only when the kept leg has already expired
      UNION ALL SELECT 'Chooser Options', ROUND(quantity * current_price / 1e6) FROM ChooserChosen WHERE settled_immediately = 1
      -- a chooser converted into the option its holder chose
      UNION ALL SELECT IFF(option_type = 1, 'Put Options', 'Call Options'), ${notional('remaining_quantity', 'entry_spot_price')} FROM ChooserConverted
    ),
    premium_rows AS (
      -- premiums buyers paid, USD × 1e6
      SELECT IFF(option_type = 1, 'Put Options', 'Call Options') AS product, remaining_premium_total_usd AS premium_usd FROM OptionPositionOpened
      UNION ALL SELECT IFF(option_type = 1, 'Put Options', 'Call Options'), remaining_premium_total_usd FROM LimitOptionOrderExecuted
      UNION ALL SELECT 'Chooser Options', remaining_premium_total_usd FROM ChooserPositionOpened
      UNION ALL SELECT 'Chooser Options', remaining_premium_total_usd FROM LimitChooserOrderExecuted
    )`, `
    SELECT 'notional' AS metric, product, SUM(notional_usd)::VARCHAR AS usd, ${noTpSlColumns} FROM notional_rows GROUP BY product
    UNION ALL SELECT 'premium', product, SUM(premium_usd)::VARCHAR, ${noTpSlColumns} FROM premium_rows GROUP BY product
    UNION ALL ${tpSlRowsSql([1], 'NULL, NULL, NULL')}
  `);

  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  for (const row of rows) {
    if (!row.metric || !row.usd) continue;
    const usd = Number(row.usd) / 1e6;
    if (row.metric === 'notional') dailyNotionalVolume.addUSDValue(usd, row.product);
    else dailyPremiumVolume.addUSDValue(usd, row.product);
  }
  // option take-profit and stop-loss sells record the share of the position they sold: the contracts sold come
  // from the position's history, valued like a sell-back (puts at their strike, calls at spot)
  for (const fill of await sizeTpSlFills(options, rows)) {
    const isPut = fill.optionType === 1;
    const price = isPut && fill.strike !== undefined ? fill.strike : fill.spot;
    dailyNotionalVolume.addUSDValue(Number(fill.quantity * price) / 1e12, isPut ? 'Put Options' : 'Call Options');
  }
  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    NotionalVolume: "Notional of every option and chooser trade: market and limit buys, sell-backs, exercises, expiry settlements, chooser conversions, and take-profit and stop-loss sells, at the execution spot price (puts at their strike). A take-profit or stop-loss sell records the share of the position it sold; the contracts sold are taken from the position's earlier events.",
    PremiumVolume: "Premiums buyers paid for options and chooser options (market and limit buys).",
  },
  breakdownMethodology: {
    NotionalVolume: {
      'Call Options': "Call option trades, valued at spot.",
      'Put Options': "Put option trades, valued at their strike.",
      'Chooser Options': "Chooser option trades (a chooser becomes a call or a put on its choice date), valued at spot.",
    },
    PremiumVolume: {
      'Call Options': "Premiums paid for call options.",
      'Put Options': "Premiums paid for put options.",
      'Chooser Options': "Premiums paid for chooser options.",
    },
  },
};

export default adapter;
