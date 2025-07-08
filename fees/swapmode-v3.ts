
import adapter from '../dexs/swapmode'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}