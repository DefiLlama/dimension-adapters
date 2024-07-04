import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.CELO, "https://celoscan.io/chart/transactionfee?output=csv")
