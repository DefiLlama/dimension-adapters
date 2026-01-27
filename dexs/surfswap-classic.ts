
import adapter from './surfswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['classic'],
}