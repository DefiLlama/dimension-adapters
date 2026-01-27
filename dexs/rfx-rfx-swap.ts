
import adapter from './rfx'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['rfx-swap'],
}