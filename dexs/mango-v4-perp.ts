
import adapter from './mango-v4'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['perp'],
}