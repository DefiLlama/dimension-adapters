
import adapter from '../dexs/caviarnine'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['orderbook']
}