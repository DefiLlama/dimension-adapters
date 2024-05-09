import { CHAIN } from "../helpers/chains";
import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.CANTO, "https://evm.explorer.canto.io/api?module=stats&action=totalfees", "canto")