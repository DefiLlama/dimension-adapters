import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "orca",
  chains: [CHAIN.SOLANA],
  start: "2021-02-14",
});
