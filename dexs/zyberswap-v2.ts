
import adapter from './zyberswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
}