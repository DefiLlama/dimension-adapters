import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.MOONBEAM, "https://moonscan.io/chart/transactionfee?output=csv", '2022-01-10')