
import adapter from '../dexs/bulbaswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}