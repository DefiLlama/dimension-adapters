import { alliumDexUsersExport } from "../helpers/alliumUsers";
import { CHAIN } from "../helpers/chains";

export default alliumDexUsersExport({
  project: "curve",
  chains: {
    [CHAIN.ETHEREUM]: "2020-01-23",
    [CHAIN.FANTOM]: "2021-02-20",
    [CHAIN.POLYGON]: "2021-04-19",
    [CHAIN.ARBITRUM]: "2021-09-12",
    [CHAIN.AVAX]: "2021-10-04",
    [CHAIN.OPTIMISM]: "2022-01-17",
    [CHAIN.BASE]: "2023-08-28",
    [CHAIN.FRAXTAL]: "2024-03-12",
    [CHAIN.XDAI]: "2025-01-07",
    [CHAIN.HYPERLIQUID]: "2025-02-21",
    [CHAIN.CELO]: "2025-04-10",
    [CHAIN.PLASMA]: "2025-11-19",
    [CHAIN.MONAD]: "2025-11-22",
    [CHAIN.UNICHAIN]: "2025-11-23",
  },
  start: "2020-01-23",
});
