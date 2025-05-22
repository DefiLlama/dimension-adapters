import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.CRONOS]: { 
    troveManager: '0x7a47cf15a1fcbad09c66077d1d021430eed7ac65', 
    redemptionEvent: 'event Redemption(uint256 _attemptedUSCAmount, uint256 _actualUSCAmount, uint256 _CollSent, uint256 _ETHFee)',
    borrowingEvent: 'event USCBorrowingFeePaid(address indexed _borrower, uint _LUSDFee)',
    stableCoin: '0xD42E078ceA2bE8D03cd9dFEcC1f0d28915Edea78',
  }
})