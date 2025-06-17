
import adapter from './traderjoe'
const { breakdown,  ...rest } = adapter as any

export default {
  ...rest,
  adapter: breakdown['v2'],
}