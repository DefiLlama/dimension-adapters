import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "pharaoh",
  chains: {
    [CHAIN.AVAX]: "2023-12-10",
  },
  start: "2023-12-10",
});
