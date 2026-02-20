
import adapter from './smbswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2025-04-01',
  adapter: breakdown['v3'],
}