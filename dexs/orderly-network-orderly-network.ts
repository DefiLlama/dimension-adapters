
import adapter from './orderly-network'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['orderly-network'],
}