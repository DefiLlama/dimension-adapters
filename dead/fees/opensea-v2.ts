
import adapter from './opensea'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2024-12-14',
  adapter: breakdown['v2'],
}