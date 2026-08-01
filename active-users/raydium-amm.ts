import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "raydium",
  chains: [CHAIN.SOLANA],
  start: "2021-03-21",
});
