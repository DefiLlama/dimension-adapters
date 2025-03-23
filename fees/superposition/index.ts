import { CHAIN } from "../../helpers/chains";
import { blockscoutFeeAdapter } from "../../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.SUPERPOSITION, "https://explorer.superposition.so/api?module=stats&action=totalfees", 'ethereum')