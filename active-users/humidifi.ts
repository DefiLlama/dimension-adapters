import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "humidifi",
  chains: [CHAIN.SOLANA],
  start: "2025-05-27",
});
