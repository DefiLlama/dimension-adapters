
import adapter from './kyberswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['elastic'],
}