
import adapter from './mux-protocol'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['mux-protocol'],
}