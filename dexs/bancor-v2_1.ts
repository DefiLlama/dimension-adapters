
import adapter from './bancor'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2.1'],
}