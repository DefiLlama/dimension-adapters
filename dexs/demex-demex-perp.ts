
import adapter from './demex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['demex-perp'],
}