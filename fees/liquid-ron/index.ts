import * as sdk from "@defillama/sdk";
import { Adapter} from "../../adapters/types";
import { RONIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import BigNumber from "bignumber.js";

const fetch = async (timestamp : number) => {

  const ts = timestamp||Math.floor(Date.now()/1000);

  const period = Math.floor(ts/86400); 

  const loggedFees = await sdk.api.abi.call({
    chain : RONIN,
    target: ADDRESSES.ronin.LRON,
    abi: "function loggedFees(uint256) view returns (uint256)",
    params: [period]
  });

  const rewardsClaimed = await sdk.api.abi.call({
    chain : RONIN,
    target: ADDRESSES.ronin.LRON,
    abi: "function rewardsClaimed(uint256) view returns (uint256)",
    params: [period]
  });

  const claimedRewards = new BigNumber(rewardsClaimed.output).div("1e18");

  const dailyRevenue = claimedRewards.multipliedBy("0.065");
  const dailyFees = new BigNumber(loggedFees.output).div("1e18").plus(claimedRewards).minus(dailyRevenue);

  return {
    dailyFees: await sdk.Balances.getUSDValue({ronin:dailyFees.toNumber()},ts),
    dailyRevenue : await sdk.Balances.getUSDValue({ronin:dailyRevenue.toNumber()},ts),
  };
};

const adapter: Adapter = {
  adapter: {
    [RONIN]: {
        fetch: fetch,
        start: '2025-04-09',
        meta: {
          methodology: {
            Fees: "Deposit fee and staking rewards.",
            Revenue: "Liquid RON takes 6.5% performance fee whenever staking rewards are claimed.",
          }
        }
    },
  }
}

export default adapter;