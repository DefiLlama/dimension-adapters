import { CHAIN } from "../helpers/chains";
import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.CANTO, "https://explorer.plexnode.wtf/api/v2/stats?module=stats&action=totalfees", "canto")