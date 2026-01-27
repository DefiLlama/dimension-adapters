
import adapter from './swapbased'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['perps'],
}