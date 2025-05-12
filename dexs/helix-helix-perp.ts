
import adapter from './helix'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['helix-perp'],
}