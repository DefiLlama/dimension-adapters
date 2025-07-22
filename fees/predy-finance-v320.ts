
import adapter from './predy-finance'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2024-12-14',
  adapter: breakdown['v320'],
}