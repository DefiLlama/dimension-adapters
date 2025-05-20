
import adapter from '../dexs/unidex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['unidex'],
}