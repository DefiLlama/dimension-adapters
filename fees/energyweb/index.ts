import { CHAIN } from "../../helpers/chains";
import { blockscoutFeeAdapter } from "../../helpers/blockscoutFees";

export default blockscoutFeeAdapter(CHAIN.ENERGYWEB, "https://explorer.energyweb.org/api?module=stats&action=totalfees", "energy-web-token")
