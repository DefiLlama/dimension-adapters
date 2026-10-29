import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// HyperDex (https://hyperdex.app/trade) - perps aggregator: one order screen routing to Hyperliquid, Lighter and Ondo,
// with HyperDex's fee on every order (Hyperliquid 2 bp builder fee, Lighter 4 bp integrator fee, Ondo 3 bp builder fee).
//
// Volume is each completed order's filled notional from HyperDex's own order record, https://hyperdex.app/api/defillama:
// Hyperliquid's read back from Hyperliquid's fills for the order id, Lighter's from Lighter's trades for the order,
// Ondo's from Ondo's answer to the order (Lighter's integrator account 761291 and Ondo's builder code are not listed per
// order by either exchange). Hyperliquid orders carry HyperDex's builder code 0x50d68EDe4a8EE71777d356d727115dF1c81fAF5f,
// but Hyperliquid's daily builder_fills file leaves out some of its fills that pay the builder fee (21 Oct: orders
// 581943886768 and 581944691157, builderFee in userFillsByTime, absent from the file), so the record is used there too.
// Fees are HyperDex's fee rate on that notional (Hyperliquid 10 bp until 2026-10-16 16:45 UTC, 2 bp after).

const HYPERDEX_API = 'https://hyperdex.app/api/defillama'
const START = '2026-10-16'

const fromRecord = (venue: 'hyperliquid' | 'lighter' | 'ondo') => async (options: FetchOptions): Promise<FetchResult> => {
  const record = await httpGet(`${HYPERDEX_API}?start=${options.startOfDay}&end=${options.startOfDay + 86400}`)
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  dailyVolume.addUSDValue(Number(record.perps?.[venue]) || 0)
  dailyFees.addUSDValue(Number(record.perpsFees?.[venue]) || 0)
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, // the orders fill on Hyperliquid, Lighter and Ondo, which list this volume themselves
  adapter: {
    [CHAIN.HYPERLIQUID]: { fetch: fromRecord('hyperliquid'), start: START },
    [CHAIN.ZK_LIGHTER]: { fetch: fromRecord('lighter'), start: START },
    [CHAIN.OFF_CHAIN]: { fetch: fromRecord('ondo'), start: START },
  },
  methodology: {
    Volume: 'Perps volume HyperDex routes to Hyperliquid, Lighter and Ondo: the filled notional of each completed order in HyperDex\'s own order record (https://hyperdex.app/api/defillama), read back from each exchange\'s fills for the order.',
    Fees: 'HyperDex\'s fee on each order: 2 bp of the filled notional on Hyperliquid (10 bp until 2026-10-16), 4 bp on Lighter and 3 bp on Ondo.',
    Revenue: 'All of these fees go to HyperDex.',
    ProtocolRevenue: 'All of these fees go to HyperDex.',
  },
}

export default adapter
