
import adapter from './fulcrom-finance'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
}