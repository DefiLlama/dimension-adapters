
import adapter from './derivio'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
}