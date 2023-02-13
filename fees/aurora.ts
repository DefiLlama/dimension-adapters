import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";
import { CHAIN } from "../helpers/chains";

export default blockscoutFeeAdapter(CHAIN.AURORA, "https://aurorascan.dev/api?module=stats&action=totalfees", "coingecko:ethereum")
