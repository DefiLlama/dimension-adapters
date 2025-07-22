
import adapter from './superswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
}