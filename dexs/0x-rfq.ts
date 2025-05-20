
import adapter from '../dexs/0x'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['0x RFQ'],
}