import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.BSC]: { 
    troveManager: '0xEC035081376ce975Ba9EAF28dFeC7c7A4c483B85',
    redemptionEvent: 'event Redemption(uint256 _attemptedUSDSAmount, uint256 _actualUSDSAmount, uint256 _BNBSent, uint256 _ETHFee)',
    stableCoin: '0x0c6Ed1E73BA73B8441868538E210ebD5DD240FA0',
  }
})