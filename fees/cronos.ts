import { CHAIN } from "../helpers/chains";
import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.CRONOS, "https://cronos.org/explorer/api?module=stats&action=totalfees")