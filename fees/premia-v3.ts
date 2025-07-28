
import adapter from './premia'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],
}