
import adapter from './opensea'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['seaport'],
}