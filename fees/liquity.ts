import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.ETHEREUM]: { 
    troveManager: '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2', 
    stableCoin: ADDRESSES.ethereum.LUSD,
    holderRevenuePercentage: 100
  }
})