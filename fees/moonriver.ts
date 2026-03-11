import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.MOONRIVER, "https://moonriver.moonscan.io/chart/transactionfee?output=csv", "moonriver")