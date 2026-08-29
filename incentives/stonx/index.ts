import { Adapter, FetchOptions, FetchResultIncentives, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStonxEmissions, STONX, STONX_LP_INCENTIVES } from "../../helpers/stonxEmissions";

/** Return the STONX emitted by every schedule overlapping the requested period. */
const fetch = async (options: FetchOptions): Promise<FetchResultIncentives> => {
  const tokenIncentives = options.createBalances();
  const emitted = await getStonxEmissions(options);
  tokenIncentives.add(STONX, emitted, STONX_LP_INCENTIVES);

  return { tokenIncentives };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  protocolType: ProtocolType.PROTOCOL,
  methodology:
    "STONX incentives scheduled by the deployed Ekubo Ve33 contract for liquidity providers. Each on-chain emission schedule is prorated to the requested time period using its Q32 reward rate, before pool-level allocation and claims.",
  breakdownMethodology: {
    TokenIncentives: {
      [STONX_LP_INCENTIVES]: "Scheduled STONX emissions used to compensate Ve33 liquidity providers.",
    },
  },
};

export default adapter;
