
import adapter from './voltswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v1'],
}