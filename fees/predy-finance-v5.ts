
import adapter from './predy-finance'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v5'],
}