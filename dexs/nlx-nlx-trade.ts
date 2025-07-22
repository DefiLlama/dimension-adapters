
import adapter from './nlx'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['nlx-trade'],
}