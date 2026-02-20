
import adapter from './pancakeswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2023-07-03',
  adapter: breakdown['v1'],
}