
import adapter from './level-finance'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['level-finance'],
}