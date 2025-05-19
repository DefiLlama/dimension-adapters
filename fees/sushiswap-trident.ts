
import adapter from '../dexs/sushiswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['trident'],
}