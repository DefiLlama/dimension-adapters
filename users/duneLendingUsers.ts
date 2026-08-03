import { CHAIN } from "../helpers/chains";
import { duneLendingUsersExport } from "./utils/duneLendingUsers";

const duneLendingUsers = [
  {
    id: "2088", // Compound V3
    project: "compound",
    version: 3,
    chains: {
      [CHAIN.ETHEREUM]: "2022-08-26",
      [CHAIN.POLYGON]: "2023-03-07",
      [CHAIN.ARBITRUM]: "2023-05-14",
      [CHAIN.BASE]: "2023-08-12",
      [CHAIN.UNICHAIN]: "2025-03-08",
    },
  },
];

export default duneLendingUsers.map(({ id, ...config }) => ({
  id,
  adapter: duneLendingUsersExport(config),
}));
