import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface VirtueFeeResponse {
  data: {
    collateralFee: number;
    liquidationFee: number;
    totalFee: number;
    periodDays: number;
  };
}

const virtueApiURL = "https://info.virtue.money/api";

const methodology = {
  Fees: "All the services fees paid by users, including liquidation and collateral fees",
  Revenue:
    "All the services fees paid by users, including liquidation and collateral fees earned by Virtue",
};

const fetch = async () => {
  const url = `${virtueApiURL}/v1/fees`;
  const res: VirtueFeeResponse = await fetchURL(url);

  const dailyFees = res.data.totalFee;
  const dailyRevenue = dailyFees;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.IOTA],
  methodology,
  start: "2025-11-01",
};

export default adapter;
