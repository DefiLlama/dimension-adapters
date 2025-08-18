import { CHAIN } from "../helpers/chains";
import { gmxV1Exports } from "../helpers/gmx";  

const methodology = {
  Fees: "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to KTC stakers",
  SupplySideRevenue: "70% of all collected fees goes to KLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to KTC stakers",
  ProtocolRevenue: "Treasury has no revenue",
};

export default gmxV1Exports({
  [CHAIN.ARBITRUM]: {
    vault: "0xc657A1440d266dD21ec3c299A8B9098065f663Bb",
    start: '2024-01-14',
    ProtocolRevenue: 0,
    SupplySideRevenue: 70,
    HoldersRevenue: 30,
    methodology,
  },
  [CHAIN.BSC]: {
    vault: "0xd98b46C6c4D3DBc6a9Cc965F385BDDDf7a660856",
    start: '2023-04-30',
    methodology,
    ProtocolRevenue: 0,
    SupplySideRevenue: 70,
    HoldersRevenue: 30,
  },
  [CHAIN.MANTLE]: {
    vault: "0x2e488D7ED78171793FA91fAd5352Be423A50Dae1",
    start: '2023-09-04',
    methodology,
    ProtocolRevenue: 0,
    SupplySideRevenue: 70,
    HoldersRevenue: 30,
  },
})
