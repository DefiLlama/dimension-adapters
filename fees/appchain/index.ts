process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { blockscoutFeeAdapter2 } from "../../helpers/blockscoutFees";
import { CHAIN } from "../../helpers/chains";

export default blockscoutFeeAdapter2(CHAIN.APPCHAIN);
