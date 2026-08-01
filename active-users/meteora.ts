import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "meteora",
  chains: [CHAIN.SOLANA],
  start: "2022-07-27",
});
