
import adapter from './kyberswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['classic'],
  methodology:  {
    UserFees: "Users pay a dynamic fee based on market conditions",
    Fees: "Kyberswap Classic collects a dynamic fee that increases with market volatility and decreases with stable market conditions",
    Revenue: "Currently 100% of the dao rewards (10% of the collected fees) goes to all voters (KNC stakers)",
    ProtocolRevenue: "Treasury have no revenue",
    HoldersRevenue: "Holders who stake and participate in the KyberDAO get their share of the fees designated for rewards, currently set at 10% of trading fees",
    SupplySideRevenue: "Liquidity providers earn 90% fees of trading routed through their pool and selected price range"
  },
}