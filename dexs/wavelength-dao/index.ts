import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFeesExport } from "../../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.VELAS]: {
      fetch: getFeesExport('0xa4a48dfcae6490afe9c779bf0f324b48683e488c', {
        revenueRatio: 0.4,
        holderRevenueRatio: 0.3,
        protocolRevenueRatio: 0.1,
      }), start: '2022-10-20',
    },
  },
  version: 2,
};
export default adapters;
