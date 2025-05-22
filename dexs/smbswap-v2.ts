
import adapter from './smbswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
}