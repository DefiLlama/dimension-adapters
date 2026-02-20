
import adapter from './morphex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: "2024-02-21",
  adapter: breakdown['swap'],
}