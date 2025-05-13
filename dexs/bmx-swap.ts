
import adapter from './bmx'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['swap'],
}