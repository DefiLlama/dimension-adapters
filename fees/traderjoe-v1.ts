
import adapter from '../dexs/traderjoe'
const { breakdown,  ...rest } = adapter as any

export default {
  ...rest,
  adapter: breakdown['v1'],
}