import { CHAIN } from "../../helpers/chains";
import { etherscanFeeAdapter } from "../../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.BITLAYER, "https://api.btrscan.com/scan/v1/chain/txForDefillama")