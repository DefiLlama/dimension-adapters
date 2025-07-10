
import adapter from './opensea'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2022-06-12',
  adapter: breakdown['v1'],
}