
import adapter from '../dexs/hydradex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2023-07-09',
  adapter: breakdown['v2'],
}