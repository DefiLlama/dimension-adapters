import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchFees = async () => {
  return {
    dailyFees: 0,
    dailyRevenue: 0,
  }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetchFees,
      start: '2023-05-12',
    }
  },
  deadFrom: '2024-10-01',
}
export default adapters;
