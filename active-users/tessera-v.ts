import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "tesserav",
  chains: [CHAIN.SOLANA],
  start: "2025-08-21",
});
