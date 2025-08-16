
import adapter from './zyberswap'
const { breakdown,  ...rest } = adapter

const methodologyV3 = {
  UserFees: "User pays dynamic swap fee.",
  Fees: "A dynamic swap fee is collected as trading fee",
  Revenue: "Protocol receives 10% of the dynamic swap fee",
  ProtocolRevenue: "Protocol receives 10% of the dynamic swap fee",
  SupplySideRevenue: "90% of the dynamic swap fee is distributed to LPs",
  HoldersRevenue:
    "A portion of the protocol fees is used to purchase WETH and distribute to stakers.",
};

export default {
  ...rest,
  adapter: breakdown['v3'],
  methodology: methodologyV3,
}