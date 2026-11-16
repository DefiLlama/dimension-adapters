// Fees come from the same on-chain swap logs as volume.
// [CHAIN.AURORA], [CHAIN.BOBA]: disabled, dexs/dodo tracks no DODO factory there and the old dashboard read
// reported $0.2 and $0 a day for them. Linea and scroll gain fees.
import adapter from "../dexs/dodo";

export default adapter;
