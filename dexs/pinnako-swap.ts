
import adapter from './pinnako'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['swap'],
}