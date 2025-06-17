import { CHAIN } from "../helpers/chains";
import { fetchChainTransactionFeesExport, } from "../helpers/getChainFees";

export default fetchChainTransactionFeesExport({ chain: CHAIN.SONIC, start: "2025-02-05" });
