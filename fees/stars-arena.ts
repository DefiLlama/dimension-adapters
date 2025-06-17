import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi = {
  "Trade": "event Trade (address trader, address subject, bool isBuy, uint256 shareAmount, uint256 amount, uint256 protocolAmount, uint256 subjectAmount, uint256 referralAmount, uint256 supply, uint256 buyPrice, uint256 myShares)",
  "TradeFractionalShares": "event TradeFractionalShares (address trader, address subject, bool isBuy, uint256 shareAmount, uint256 amount, uint256 protocolAmount, uint256 subjectAmount, uint256 referralAmount, uint256 fractionalSupply, uint256 buyPrice, uint256 myFractionalShares)",
};

const topics = {
  Trade: "0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee",
  TradeFractionalShares: "0x7d26fca21642884249fe04718e734992f6e00b24a015ddfbd8018e2639417b56",
};

const fetch = async ({createBalances, getLogs}: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyVolume = createBalances();

  const tradeLogs = await getLogs({
    topic: topics.Trade,
    targets: ['0xC605C2cf66ee98eA925B1bb4FeA584b71C00cC4C', '0x69B7F08B2952e2EE3CA4222190BCF07831f1096f'],
    eventAbi: abi.Trade,
  });

  const tradeFractionalShareLogs = await getLogs({
    topic: topics.TradeFractionalShares,
    targets: ['0xC605C2cf66ee98eA925B1bb4FeA584b71C00cC4C'],
    eventAbi: abi.TradeFractionalShares,
  });

  function addLogData(log: any) {
    dailyVolume.addGasToken(log.amount);
    dailyRevenue.addGasToken(log.protocolAmount);
    dailyFees.addGasToken(log.protocolAmount + log.subjectAmount + log.referralAmount);
  }

  tradeLogs.forEach(addLogData);
  tradeFractionalShareLogs.forEach(addLogData);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2023-09-19',
    },
  }
}

export default adapter;
