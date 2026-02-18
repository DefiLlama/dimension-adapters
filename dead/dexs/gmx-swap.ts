
import adapter from './gmx'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['swap'],
  deadFrom: '2025-07-09'
}