import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const AppStaking = "0xd060499DDC9cb7deB07f080BAeB1aDD36AA2C650";
const RewardAddedEvent = "event RewardAdded(uint256 reward)";
const RZR = "0xb4444468e444f89e1c2CAc2F1D3ee7e336cBD1f5";

export const fetchRebases = async (
  balances: Balances,
  options: FetchOptions
) => {
  const data: any[] = await options.getLogs({
    target: AppStaking,
    eventAbi: RewardAddedEvent,
  });

  data.forEach((log: any) => {
    balances.add(RZR, log.reward);
  });
};
