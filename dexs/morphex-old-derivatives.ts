
import adapter from './morphex-old'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: "2024-02-21",
  adapter: breakdown['derivatives'],
}