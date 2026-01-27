
import adapter from './traderjoe'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v1'],
}