
import adapter from './sushiswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['trident'],
}