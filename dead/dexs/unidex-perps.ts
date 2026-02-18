
import adapter from '../dexs/unidex'
const { breakdown,  ...rest } = adapter

export default {
  deadFrom: '2025-05-30',  // showing hyperliquid orderbook and 0 OI
  ...rest,
  adapter: breakdown['unidex'],
}