
import adapter from './spacedex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['swap'],
}