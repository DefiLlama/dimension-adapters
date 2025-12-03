import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.TAIKO, "https://taikoscan.io/chart/transactionfee?output=csv", "ethereum");