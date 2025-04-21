import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.ETHEREUM]: { 
    troveManager: '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2', 
    stableCoin: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0 ',
    holderRevenuePercentage: 100
  }
})