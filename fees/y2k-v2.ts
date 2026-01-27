
import adapter from './y2k'
const { breakdown,  ...rest } = adapter as any

export default {
  ...rest,
  adapter: breakdown['v2'],
}