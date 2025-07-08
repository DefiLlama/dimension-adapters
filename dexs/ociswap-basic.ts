
import adapter from './ociswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['basic'],
}