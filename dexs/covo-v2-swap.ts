
import adapter from './covo-v2'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['swap'],
}