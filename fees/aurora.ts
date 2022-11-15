import { CHAIN } from "../helpers/chains";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

export default etherscanFeeAdapter(CHAIN.AURORA, "https://aurorascan.dev/chart/transactionfee?output=csv", "coingecko:ethereum")