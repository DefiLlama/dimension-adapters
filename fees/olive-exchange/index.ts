import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { isUsdc, pubkey, queryOliveEvents, readCustodies, START } from "./shared";

const LABELS = {
  options: 'Options Trading Fees',
  closes: 'Perps And Futures Close Fees',
  liquidations: 'Liquidation Fees',
  borrow: 'Borrow Fees',
  liquidity: 'Liquidity Fees',
};

// Each fee is split on chain by the event's own company_fee_share_bps (2500 = 25% in every pool since launch):
// floor(fee × bps / 10000) to Olive, the rest stays in the pool for its liquidity providers. Borrow fees are not
// split: they stay in the pool in full.
const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'OptionPositionOpened', 'LimitOptionOrderExecuted', 'OptionPositionClosed', 'ChooserPositionOpened',
    'LimitChooserOrderExecuted', 'ChooserPositionClosed', 'ChooserTpSlOrderExecuted', 'PerpPositionClosed',
    'PositionLiquidated', 'FuturePositionClosed', 'FuturePositionLiquidated', 'TpSlOrderExecuted', 'LiquidityAdded',
    'LiquidityRemoved',
  ], `
    usd_fees AS (
      -- trading fees in USD × 1e6, each with the share Olive took
      SELECT '${LABELS.options}' AS label, protocol_fee_usd AS fee, bps FROM OptionPositionOpened
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM LimitOptionOrderExecuted
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM OptionPositionClosed
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM ChooserPositionOpened
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM LimitChooserOrderExecuted
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM ChooserPositionClosed
      UNION ALL SELECT '${LABELS.options}', protocol_fee_usd, bps FROM ChooserTpSlOrderExecuted
      -- TP/SL fills: contract_type 1 is an option, 0 a perp, 2 an expiry future
      UNION ALL SELECT IFF(contract_type = 1, '${LABELS.options}', '${LABELS.closes}'), trade_fees_paid_usd, bps FROM TpSlOrderExecuted
      UNION ALL SELECT '${LABELS.closes}', trade_fees_paid_usd, bps FROM PerpPositionClosed
      UNION ALL SELECT '${LABELS.closes}', trade_fees_paid_usd, bps FROM FuturePositionClosed
      UNION ALL SELECT '${LABELS.liquidations}', trade_fees_paid_usd, bps FROM PositionLiquidated
      UNION ALL SELECT '${LABELS.liquidations}', liquidation_fee, bps FROM FuturePositionLiquidated
      -- deposit fees, valued at the deposit's USD value at the oracle price the program used
      UNION ALL SELECT '${LABELS.liquidity}', ROUND(token_amount_usd * fee_amount / deposit_amount), bps FROM LiquidityAdded WHERE deposit_amount > 0
    ),
    borrow_fees AS (
      SELECT borrow_fees_paid_usd AS fee FROM PerpPositionClosed
      UNION ALL SELECT borrow_fees_paid_usd FROM PositionLiquidated
      UNION ALL SELECT borrow_fees_paid_usd FROM TpSlOrderExecuted
    )`, `
    SELECT label, NULL AS custody, SUM(fee)::VARCHAR AS fee, SUM(FLOOR(fee * bps / 10000))::VARCHAR AS company FROM usd_fees GROUP BY label
    UNION ALL SELECT '${LABELS.borrow}', NULL, SUM(fee)::VARCHAR, '0' FROM borrow_fees
    -- withdrawal fees are paid in the withdrawn token, in raw mint units
    UNION ALL SELECT '${LABELS.liquidity}', custody, SUM(fee_amount)::VARCHAR, SUM(FLOOR(fee_amount * bps / 10000))::VARCHAR FROM LiquidityRemoved GROUP BY custody
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokenRows = rows.filter((row) => row.label && row.custody && Number(row.fee) > 0);
  const custodies = await readCustodies(tokenRows.map((row) => pubkey(row.custody)));

  for (const row of rows) {
    if (!row.label || !row.fee) continue; // no event of this kind in the window
    const fee = Number(row.fee);
    const company = Number(row.company);
    if (fee === 0) continue;
    if (!row.custody) {
      dailyFees.addUSDValue(fee / 1e6, row.label);
      if (company > 0) dailyRevenue.addUSDValue(company / 1e6, `${row.label} To Olive`);
      dailySupplySideRevenue.addUSDValue((fee - company) / 1e6, `${row.label} To LPs`);
      continue;
    }
    const { mint } = custodies[pubkey(row.custody)];
    if (isUsdc(mint)) {
      // USDC is counted at $1, as the program does
      dailyFees.addUSDValue(fee / 1e6, row.label);
      dailyRevenue.addUSDValue(company / 1e6, `${row.label} To Olive`);
      dailySupplySideRevenue.addUSDValue((fee - company) / 1e6, `${row.label} To LPs`);
    } else {
      dailyFees.add(mint, fee, row.label);
      dailyRevenue.add(mint, company, `${row.label} To Olive`);
      dailySupplySideRevenue.add(mint, fee - company, `${row.label} To LPs`);
    }
  }

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Fees: "Fees traders and liquidity providers pay Olive: option and chooser open and close fees, perp and expiry-future close fees, liquidation fees, perp borrow fees, and liquidity deposit and withdrawal fees. Read from the program's events.",
  UserFees: "All fees above are paid by Olive's users (traders and liquidity providers).",
  Revenue: "Olive's share of trading, liquidation and liquidity fees (company_fee_share_bps of each fee, 25% since launch). Borrow fees go to liquidity providers in full.",
  ProtocolRevenue: "Olive's share of trading, liquidation and liquidity fees, collected into each pool's protocol fee account.",
  SupplySideRevenue: "The rest of every trading, liquidation and liquidity fee, plus all borrow fees, which stay in the pools for their liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.options]: "Fees on opening and closing options and chooser options (market and limit orders, sell-backs and TP/SL sells).",
    [LABELS.closes]: "Fees on closing perpetual and expiry-future positions (perps and futures have no open fee).",
    [LABELS.liquidations]: "Fees charged when a perpetual or expiry-future position is liquidated.",
    [LABELS.borrow]: "Borrow fees perpetual positions pay for the pool liquidity they reserve, charged when a position is closed or liquidated.",
    [LABELS.liquidity]: "Fees liquidity providers pay on deposits and withdrawals.",
  },
  UserFees: {
    [LABELS.options]: "Paid by option and chooser traders.",
    [LABELS.closes]: "Paid by perp and expiry-future traders on closing.",
    [LABELS.liquidations]: "Paid out of the liquidated position.",
    [LABELS.borrow]: "Paid by perp traders.",
    [LABELS.liquidity]: "Paid by liquidity providers on deposit and withdrawal.",
  },
  Revenue: {
    [`${LABELS.options} To Olive`]: "Olive's share of option and chooser fees.",
    [`${LABELS.closes} To Olive`]: "Olive's share of perp and expiry-future close fees.",
    [`${LABELS.liquidations} To Olive`]: "Olive's share of liquidation fees.",
    [`${LABELS.liquidity} To Olive`]: "Olive's share of liquidity deposit and withdrawal fees.",
  },
  ProtocolRevenue: {
    [`${LABELS.options} To Olive`]: "Olive's share of option and chooser fees.",
    [`${LABELS.closes} To Olive`]: "Olive's share of perp and expiry-future close fees.",
    [`${LABELS.liquidations} To Olive`]: "Olive's share of liquidation fees.",
    [`${LABELS.liquidity} To Olive`]: "Olive's share of liquidity deposit and withdrawal fees.",
  },
  SupplySideRevenue: {
    [`${LABELS.options} To LPs`]: "The pool's share of option and chooser fees.",
    [`${LABELS.closes} To LPs`]: "The pool's share of perp and expiry-future close fees.",
    [`${LABELS.liquidations} To LPs`]: "The pool's share of liquidation fees.",
    [`${LABELS.borrow} To LPs`]: "All borrow fees, kept by the pool.",
    [`${LABELS.liquidity} To LPs`]: "The pool's share of liquidity deposit and withdrawal fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
