
import adapter from './fjord-foundry'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v1'],
}