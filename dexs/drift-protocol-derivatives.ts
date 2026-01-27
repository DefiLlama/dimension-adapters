
import adapter from './drift-protocol'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
}