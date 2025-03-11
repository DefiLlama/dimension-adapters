import { CHAIN } from "../helpers/chains";
import { fetchChainTransactionFeesExport, } from "../helpers/getChainFees";

export default fetchChainTransactionFeesExport({ chain: CHAIN.SEI, start: "2025-02-05" });
