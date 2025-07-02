
import adapter from './gmx-v2'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['gmx-v2-trade'],
}