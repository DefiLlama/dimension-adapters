import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.MOONBEAN, "https://moonscan.io/chart/transactionfee?output=csv")
