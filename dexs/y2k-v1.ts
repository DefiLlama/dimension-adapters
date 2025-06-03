
import adapter from './y2k'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v1'],
}