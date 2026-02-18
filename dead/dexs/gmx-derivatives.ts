
import adapter from './gmx'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['derivatives'],
  deadFrom : '2025-07-09'
}