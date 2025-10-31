
import adapter from './helix'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  doublecounted: true,
  adapter: breakdown['helix-perp'],
}