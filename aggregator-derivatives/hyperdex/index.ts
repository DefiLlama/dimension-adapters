import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// HyperDex (https://hyperdex.app/trade) - perps aggregator: one order screen routing to Hyperliquid, Lighter and Ondo,
//
// Volume is each completed order's filled notional from HyperDex's own order record, https://hyperdex.app/api/defillama:
// Hyperliquid's read back from Hyperliquid's fills for the order id, Lighter's from Lighter's trades for the order,
// Ondo's from Ondo's answer to the order (Lighter's integrator account 761291 and Ondo's builder code are not listed per
// order by either exchange). Hyperliquid orders carry HyperDex's builder code 0x50d68EDe4a8EE71777d356d727115dF1c81fAF5f,
// but Hyperliquid's daily builder_fills file leaves out some of its fills that pay the builder fee (21 Oct: orders
// 581943886768 and 581944691157, builderFee in userFillsByTime, absent from the file), so the record is used there too.
// Volume only: the record does not yet hold each order's charged fee.

const HYPERDEX_API = 'https://hyperdex.app/api/defillama'
const START = '2026-10-16'

const fromRecord = (venue: 'hyperliquid' | 'lighter' | 'ondo') => async (options: FetchOptions): Promise<FetchResult> => {
  const record = await httpGet(`${HYPERDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`)
  const dailyVolume = options.createBalances()
  dailyVolume.addUSDValue(Number(record.perps?.[venue]) || 0)
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the orders fill on Hyperliquid, Lighter and Ondo, which list this volume themselves
  adapter: {
    [CHAIN.HYPERLIQUID]: { fetch: fromRecord('hyperliquid'), start: START },
    [CHAIN.ZK_LIGHTER]: { fetch: fromRecord('lighter'), start: START },
    [CHAIN.OFF_CHAIN]: { fetch: fromRecord('ondo'), start: START },
  },
  methodology: {
    Volume: 'Perps volume HyperDex routes to Hyperliquid, Lighter and Ondo: the filled notional of each completed order in HyperDex\'s own order record (https://hyperdex.app/api/defillama), read back from each exchange\'s fills for the order.',
  },
}

export default adapter
