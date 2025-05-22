
import adapter from './pancakeswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['stableswap'],
}