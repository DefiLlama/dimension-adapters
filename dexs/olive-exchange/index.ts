import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { noTpSlColumns, pubkey, queryOliveEvents, readCustodies, sizeTpSlFills, START, tpSlRowsSql } from "../../fees/olive-exchange/shared";

// Perpetual and expiry-future volume: every trader fill counts once at its execution spot price (opens, limit
// fills, closes, take-profit and stop-loss fills), so a position opened and closed counts twice. Liquidations
// and expiry settlements are not trades and are left out. Futures are valued at spot, not at their future price.
const fetch = async (options: FetchOptions) => {
  const rows = await queryOliveEvents(options, [
    'PerpPositionOpened', 'LimitOrderExecuted', 'PerpPositionClosed', 'FuturePositionOpened',
    'LimitFutureOrderExecuted', 'FuturePositionClosed', 'TpSlOrderExecuted',
  ], `
    fills AS (
      -- quantity in raw units of the market's underlying token, spot in USD × 1e6 per pricing unit
      SELECT custody, base_quantity_native AS quantity, entry_spot_price AS spot FROM PerpPositionOpened
      UNION ALL SELECT custody, base_quantity_native, execution_spot_price FROM LimitOrderExecuted
      UNION ALL SELECT custody, closed_base_quantity_native, current_spot_price FROM PerpPositionClosed
      UNION ALL SELECT custody, base_quantity_native, entry_spot_price FROM FuturePositionOpened
      UNION ALL SELECT custody, base_quantity_native, execution_spot_price FROM LimitFutureOrderExecuted
      UNION ALL SELECT custody, closed_base_quantity_native, current_spot_price FROM FuturePositionClosed
    )`, `
    SELECT custody AS fill_custody, SUM(quantity * spot)::VARCHAR AS quantity_spot, ${noTpSlColumns} FROM fills GROUP BY custody
    UNION ALL ${tpSlRowsSql([0, 2], 'NULL, NULL')}
  `);

  // TP/SL fills record the share of the position they closed: their size comes from the position's history
  const tpSlFills = await sizeTpSlFills(options, rows);
  const volumes = [
    ...rows.filter((row) => row.fill_custody).map((row) => ({ custody: row.fill_custody, quantitySpot: BigInt(row.quantity_spot) })),
    ...tpSlFills.map((fill) => ({ custody: fill.custody, quantitySpot: fill.quantity * fill.spot })),
  ];

  const dailyVolume = options.createBalances();
  // a custody's decimals are its pricing decimals: the mint decimals, plus n for pools priced per 10^n tokens
  const custodies = await readCustodies(volumes.map((volume) => pubkey(volume.custody)));
  for (const volume of volumes) {
    const { decimals } = custodies[pubkey(volume.custody)];
    dailyVolume.addUSDValue(Number(volume.quantitySpot) / 10 ** decimals / 1e6);
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
    Volume: "Notional of every perpetual and expiry-future trade (opens, limit fills, closes, take-profit and stop-loss fills) at its execution spot price, read from the program's events. Liquidations and expiry settlements are not counted. A take-profit or stop-loss fill records the share of the position it closed; its size is taken from the position's earlier events.",
  },
};

export default adapter;
