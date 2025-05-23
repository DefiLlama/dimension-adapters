
import adapter from './beamswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['stable-amm'],
}