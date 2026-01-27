
import adapter from './wavex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
}