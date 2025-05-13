
import adapter from './balancer'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v1'],
}