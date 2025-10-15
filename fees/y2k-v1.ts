
import adapter from './y2k'
const { breakdown, ...rest } = adapter as any

export default {
  ...rest,
  methodology: {
    Fees: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees",
    Revenue: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees",
  },
  adapter: breakdown['v1'],
}