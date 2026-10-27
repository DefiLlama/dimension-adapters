import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { pubkey, queryOliveEvents, readCustodies, START } from "../../fees/olive-exchange/shared";

// Perpetual and expiry-future volume: every fill counts once at its execution spot price (opens, limit fills,
// closes, liquidations and expiry settlements), so a position opened and closed counts twice, as on Olive's own
// Exchange Data page. Futures are valued at spot, not at their future price.
const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'PerpPositionOpened', 'LimitOrderExecuted', 'PerpPositionClosed', 'PositionLiquidated', 'FuturePositionOpened',
    'LimitFutureOrderExecuted', 'FuturePositionClosed', 'FuturePositionSettled', 'FuturePositionLiquidated',
  ], `
    fills AS (
      -- quantity in raw units of the market's underlying token, spot in USD × 1e6 per pricing unit
      SELECT 'Perpetuals' AS product, custody, base_quantity_native AS quantity, entry_spot_price AS spot FROM PerpPositionOpened
      UNION ALL SELECT 'Perpetuals', custody, base_quantity_native, execution_spot_price FROM LimitOrderExecuted
      UNION ALL SELECT 'Perpetuals', custody, closed_base_quantity_native, current_spot_price FROM PerpPositionClosed
      UNION ALL SELECT 'Perpetuals', custody, base_quantity_native, liquidation_trigger_spot_price FROM PositionLiquidated
      UNION ALL SELECT 'Expiry Futures', custody, base_quantity_native, entry_spot_price FROM FuturePositionOpened
      UNION ALL SELECT 'Expiry Futures', custody, base_quantity_native, execution_spot_price FROM LimitFutureOrderExecuted
      UNION ALL SELECT 'Expiry Futures', custody, closed_base_quantity_native, current_spot_price FROM FuturePositionClosed
      UNION ALL SELECT 'Expiry Futures', custody, settled_base_quantity_native, settlement_spot_price FROM FuturePositionSettled
      UNION ALL SELECT 'Expiry Futures', custody, liquidated_base_quantity_native, liquidation_trigger_spot_price FROM FuturePositionLiquidated
    )`, `
    SELECT product, custody, SUM(quantity * spot)::VARCHAR AS quantity_spot FROM fills GROUP BY product, custody
  `);

  const dailyVolume = options.createBalances();
  const filled = rows.filter((row) => row.custody);
  // a custody's decimals are its pricing decimals: the mint decimals, plus n for pools priced per 10^n tokens
  const custodies = await readCustodies(filled.map((row) => pubkey(row.custody)));
  for (const row of filled) {
    const { decimals } = custodies[pubkey(row.custody)];
    dailyVolume.addUSDValue(Number(row.quantity_spot) / 10 ** decimals / 1e6, row.product);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume: "Notional of every perpetual and expiry-future fill (opens, limit fills, closes, liquidations and expiry settlements) at its execution spot price, read from the program's events. Take-profit and stop-loss fills are not included: their event does not record the size filled (none has happened yet).",
  },
  breakdownMethodology: {
    Volume: {
      Perpetuals: "Perpetual position fills.",
      'Expiry Futures': "Expiry-future position fills, valued at spot.",
    },
  },
};

export default adapter;
