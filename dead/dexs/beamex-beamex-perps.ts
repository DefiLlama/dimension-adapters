
import adapter from './beamex'
const { breakdown,  ...rest } = adapter

export default {
  deadFrom: '2025-05-30',
  ...rest,
  adapter: breakdown['beamex-perps'],
}