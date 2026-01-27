
import adapter from './quickswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}