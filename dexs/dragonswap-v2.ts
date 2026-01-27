
import adapter from './dragonswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
}