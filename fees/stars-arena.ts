import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

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
  const dailySupplySideRevenue = createBalances();
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
    dailyFees.addGasToken(log.protocolAmount, METRIC.TRADING_FEES);
    dailyFees.addGasToken(log.subjectAmount, METRIC.CREATOR_FEES);
    dailyFees.addGasToken(log.referralAmount, 'Referral Fees');
    dailyRevenue.addGasToken(log.protocolAmount, METRIC.TRADING_FEES);
    dailySupplySideRevenue.addGasToken(log.subjectAmount, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(log.referralAmount, 'Referral Fees');
  }

  tradeLogs.forEach(addLogData);
  tradeFractionalShareLogs.forEach(addLogData);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2023-09-19',
    },
  },
  methodology: {
    Fees: "Includes protocol, creator and referral fees",
    Revenue: "Trading fees charged by the protocol",
    SupplySideRevenue: "Includes creator and referral fees"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Fees collected by the protocol from each trade',
      [METRIC.CREATOR_FEES]: 'Fees paid to the subject/creator whose shares are being traded',
      'Referral Fees': 'Fees paid to referrers',
    },
    Revenue: {
      [METRIC.TRADING_FEES]: 'Protocol\'s share of trading fees retained as revenue',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: 'Portion of trading fees distributed to subjects/creators',
      'Referral Fees': 'Portion of trading fees distributed to referrers',
    },
  },
}

export default adapter;
