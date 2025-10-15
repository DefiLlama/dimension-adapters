
import adapter from './baseswap'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}