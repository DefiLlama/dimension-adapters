
import adapter from './aave'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
}