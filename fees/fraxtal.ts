import { CHAIN } from "../helpers/chains";
import { fetchChainTransactionFeesExport, } from "../helpers/getChainFees";

export default fetchChainTransactionFeesExport({ chain: CHAIN.FRAXTAL, start: "2025-02-05" });
