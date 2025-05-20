
import adapter from './ArbitrumExchange'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}