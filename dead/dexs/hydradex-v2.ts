
import adapter from './hydradex'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2023-07-09',
  adapter: breakdown['v2'],
}