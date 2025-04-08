import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.PULSECHAIN]: { 
    troveManager: '0xD79bfb86fA06e8782b401bC0197d92563602D2Ab', 
    redemptionEvent: 'event Redemption(uint256 _attemptedUSDLAmount, uint256 _actualUSDLAmount, uint256 _PLSSent, uint256 _PLSFee)',
    borrowingEvent: 'event USDLBorrowingFeePaid(address indexed _borrower, uint256 _USDLFee)'
  }
})