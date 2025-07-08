
import adapter from './beamex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['beamex-swap'],
}