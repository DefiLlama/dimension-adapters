
import adapter from './metavault.trade'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['metavault.trade'],
}