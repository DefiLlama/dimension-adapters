import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.ETHEREUM]: { 
    troveManager: '0xfC7d41A684b7dB7c817A9dDd028f9A31c2F6f893', 
    redemptionEvent: 'event Redemption(uint256 _attemptedTHUSDAmount, uint256 _actualTHUSDAmount, uint256 _collateralSent, uint256 _collateralFee)',
    borrowingEvent: 'event THUSDBorrowingFeePaid(address indexed _borrower, uint256 _THUSDFee)'
  }
})