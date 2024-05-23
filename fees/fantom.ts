import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.FANTOM, "https://ftmscan.com/chart/transactionfee?output=csv")
