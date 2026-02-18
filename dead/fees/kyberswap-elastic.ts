
import adapter from './kyberswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['elastic'],
  methodology: {
    UserFees: "Users pay trading fees based pool fee setting: 0.008%, 0.01%, 0.04%, 0.3% and 1%",
    Fees: "Each pool can have different fees set from the following tires: 0.008%, 0.01%, 0.04%, 0.3% and 1%",
    Revenue: "Currently 100% of the dao rewards (10% of the collected fees) goes to all voters (KNC stakers)",
    ProtocolRevenue: "Treasury have no revenue",
    HoldersRevenue: "Holders who stake and participate in the KyberDAO get their share of the fees designated for rewards, currently set at 10% of trading fees",
    SupplySideRevenue: "Liquidity providers earn 90% fees of trading routed through their pool and selected price range"
  },
}