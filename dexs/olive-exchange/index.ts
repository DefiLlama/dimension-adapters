import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { isUsdc, noTpSlColumns, pubkey, queryOliveEvents, readCustodies, sizeTpSlFills, START, tpSlRowsSql } from "../../helpers/oliveExchange";

// Option and chooser trading fees are counted in options/olive-exchange.
const LABELS = {
  closes: 'Perps And Futures Close Fees',
  liquidations: 'Liquidation Fees',
  borrow: 'Borrow Fees',
  liquidity: 'Liquidity Fees',
};

// Perpetual and expiry-future volume: every trader fill counts once at its execution spot price (opens, limit
// fills, closes, take-profit and stop-loss fills), so a position opened and closed counts twice. Liquidations
// and expiry settlements are not trades and are left out. Futures are valued at spot, not at their future price.
// Fees: each fee is split on chain by the event's own company_fee_share_bps (2500 = 25% in every pool since
// launch): floor(fee × bps / 10000) to Olive, the rest stays in the pool for its liquidity providers. Borrow fees
// are not split: they stay in the pool in full.
const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'PerpPositionOpened', 'LimitOrderExecuted', 'PerpPositionClosed', 'FuturePositionOpened',
    'LimitFutureOrderExecuted', 'FuturePositionClosed', 'TpSlOrderExecuted', 'PositionLiquidated',
    'FuturePositionLiquidated', 'LiquidityAdded', 'LiquidityRemoved',
  ], `
    fills AS (
      -- quantity in raw units of the market's underlying token, spot in USD × 1e6 per pricing unit
      SELECT custody, base_quantity_native AS quantity, entry_spot_price AS spot FROM PerpPositionOpened
      UNION ALL SELECT custody, base_quantity_native, execution_spot_price FROM LimitOrderExecuted
      UNION ALL SELECT custody, closed_base_quantity_native, current_spot_price FROM PerpPositionClosed
      UNION ALL SELECT custody, base_quantity_native, entry_spot_price FROM FuturePositionOpened
      UNION ALL SELECT custody, base_quantity_native, execution_spot_price FROM LimitFutureOrderExecuted
      UNION ALL SELECT custody, closed_base_quantity_native, current_spot_price FROM FuturePositionClosed
    ),
    usd_fees AS (
      -- trading fees in USD × 1e6, each with the share Olive took
      -- TP/SL fills: contract_type 0 is a perp, 2 an expiry future (1, an option, is in options/olive-exchange)
      SELECT '${LABELS.closes}' AS label, trade_fees_paid_usd AS fee, bps FROM TpSlOrderExecuted WHERE contract_type IN (0, 2)
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
    SELECT custody AS fill_custody, SUM(quantity * spot)::VARCHAR AS quantity_spot, NULL AS label, NULL AS fee_custody, NULL AS fee, NULL AS company, ${noTpSlColumns} FROM fills GROUP BY custody
    UNION ALL SELECT NULL, NULL, label, NULL, SUM(fee)::VARCHAR, SUM(FLOOR(fee * bps / 10000))::VARCHAR, ${noTpSlColumns} FROM usd_fees GROUP BY label
    UNION ALL SELECT NULL, NULL, '${LABELS.borrow}', NULL, SUM(fee)::VARCHAR, '0', ${noTpSlColumns} FROM borrow_fees
    -- withdrawal fees are paid in the withdrawn token, in raw mint units
    UNION ALL SELECT NULL, NULL, '${LABELS.liquidity}', custody, SUM(fee_amount)::VARCHAR, SUM(FLOOR(fee_amount * bps / 10000))::VARCHAR, ${noTpSlColumns} FROM LiquidityRemoved GROUP BY custody
    UNION ALL ${tpSlRowsSql([0, 2], 'NULL, NULL, NULL, NULL, NULL, NULL')}
  `);

  // TP/SL fills record the share of the position they closed: their size comes from the position's history
  const tpSlFills = await sizeTpSlFills(options, rows);
  const volumes = [
    ...rows.filter((row) => row.fill_custody).map((row) => ({ custody: row.fill_custody, quantitySpot: BigInt(row.quantity_spot) })),
    ...tpSlFills.map((fill) => ({ custody: fill.custody, quantitySpot: fill.quantity * fill.spot })),
  ];
  const tokenFeeRows = rows.filter((row) => row.label && row.fee_custody && Number(row.fee) > 0);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // a custody's decimals are its pricing decimals: the mint decimals, plus n for pools priced per 10^n tokens
  const custodies = await readCustodies([...volumes.map((volume) => volume.custody), ...tokenFeeRows.map((row) => row.fee_custody)].map(pubkey));
  for (const volume of volumes) {
    const { decimals } = custodies[pubkey(volume.custody)];
    dailyVolume.addUSDValue(Number(volume.quantitySpot) / 10 ** decimals / 1e6);
  }

  for (const row of rows) {
    if (!row.label || !row.fee) continue; // no event of this kind in the window
    const fee = Number(row.fee);
    const company = Number(row.company);
    if (fee === 0) continue;
    if (!row.fee_custody) {
      dailyFees.addUSDValue(fee / 1e6, row.label);
      if (company > 0) dailyRevenue.addUSDValue(company / 1e6, `${row.label} To Olive`);
      dailySupplySideRevenue.addUSDValue((fee - company) / 1e6, `${row.label} To LPs`);
      continue;
    }
    const { mint } = custodies[pubkey(row.fee_custody)];
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

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Volume: "Notional of every perpetual and expiry-future trade (opens, limit fills, closes, and take-profit and stop-loss fills) at its execution spot price. Liquidations and expiry settlements are not trades and are not counted.",
  Fees: "Fees perp and expiry-future traders and liquidity providers pay Olive: perp and expiry-future close fees, liquidation fees, perp borrow fees, and deposit and withdrawal fees on the pools Olive's options and perps share. Option and chooser trading fees are counted in Olive's options listing.",
  UserFees: "Close, liquidation and borrow fees paid by perp and expiry-future traders, and deposit and withdrawal fees paid by liquidity providers.",
  Revenue: "Olive's share of perp and expiry-future close, liquidation and liquidity fees: 25% of each fee since launch, set per pool on chain. Borrow fees go to liquidity providers in full.",
  ProtocolRevenue: "Olive's share of perp and expiry-future close, liquidation and liquidity fees (25% since launch), collected into each pool's protocol fee account.",
  SupplySideRevenue: "The liquidity providers' share of perp and expiry-future close, liquidation and liquidity fees (75% since launch), plus all borrow fees, kept by the pools.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.closes]: "Fees on closing perpetual and expiry-future positions (perps and futures have no open fee).",
    [LABELS.liquidations]: "Fees charged when a perpetual or expiry-future position is liquidated.",
    [LABELS.borrow]: "Borrow fees perpetual positions pay for the pool liquidity they reserve, charged when a position is closed or liquidated.",
    [LABELS.liquidity]: "Fees liquidity providers pay on deposits and withdrawals.",
  },
  UserFees: {
    [LABELS.closes]: "Paid by perp and expiry-future traders on closing.",
    [LABELS.liquidations]: "Paid out of the liquidated position.",
    [LABELS.borrow]: "Paid by perp traders.",
    [LABELS.liquidity]: "Paid by liquidity providers on deposit and withdrawal.",
  },
  Revenue: {
    [`${LABELS.closes} To Olive`]: "Olive's share of perp and expiry-future close fees.",
    [`${LABELS.liquidations} To Olive`]: "Olive's share of liquidation fees.",
    [`${LABELS.liquidity} To Olive`]: "Olive's share of liquidity deposit and withdrawal fees.",
  },
  ProtocolRevenue: {
    [`${LABELS.closes} To Olive`]: "Olive's share of perp and expiry-future close fees.",
    [`${LABELS.liquidations} To Olive`]: "Olive's share of liquidation fees.",
    [`${LABELS.liquidity} To Olive`]: "Olive's share of liquidity deposit and withdrawal fees.",
  },
  SupplySideRevenue: {
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
