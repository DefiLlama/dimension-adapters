import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async ({createBalances, getLogs}: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances()
  const logs = await getLogs({
    topic: '0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee',
    targets: ['0xC605C2cf66ee98eA925B1bb4FeA584b71C00cC4C', '0x69B7F08B2952e2EE3CA4222190BCF07831f1096f'],
    eventAbi: 'event Trade (address trader, address subject, bool isBuy, uint256 shareAmount, uint256 amount, uint256 protocolAmount, uint256 subjectAmount, uint256 referralAmount, uint256 supply, uint256 buyPrice, uint256 myShares)'
  });
  logs.map((log: any) => {
    dailyFees.addGasToken(log.protocolAmount+log.subjectAmount+log.referralAmount);
    dailyRevenue.addGasToken(log.protocolAmount)
  });
  return {
    dailyFees,
    dailyRevenue
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 1695081600,
    },
  }
}

export default adapter;
