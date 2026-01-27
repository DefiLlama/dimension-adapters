import { FetchOptions, Fetch, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";

// https://staderlabs.notion.site/Introducing-SD-1160c9a4217d477eaafb963e21f90aba
// stader do buy back using 20% of the revenue generated in the respective quarters

const fetchEthereum: Fetch = async (_a: any, _b: any, option: FetchOptions) => {
  const dailyFees = option.createBalances();
  const dailyRevenue = option.createBalances();
  const dailyMaticXFees = option.createBalances();
  const dailyMaticXRev = option.createBalances();

  const logsFees = await option.getLogs({
    target: "0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645",
    eventAbi:
      "event DistributeFees(address indexed _treasury, uint256 _feeAmount)",
  });
  logsFees.map((e) => {
    dailyMaticXRev.addCGToken("matic-network", Number(e._feeAmount) / 1e18);
  });

  const logs = await option.getLogs({
    target: "0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645",
    eventAbi:
      "event StakeRewards(uint256 indexed _validatorId, uint256 _stakedAmount)",
  });
  logs.map((e) => {
    dailyMaticXFees.addCGToken("matic-network", Number(e._stakedAmount) / 1e18);
  });
  dailyMaticXFees.addBalances(dailyMaticXRev); // StakeRewards excludes stader revenue

  const date = new Date(option.startOfDay * 1000).toISOString().split("T")[0];

  const sql = getSqlFromFile("helpers/queries/stader.sql", { target_date: date });
  const res: { user_rewards: string; stader_revenue: string }[] = await queryDuneSql(option, sql);

  res.forEach((item) => {
    dailyFees.addUSDValue(item.user_rewards);
    dailyRevenue.addUSDValue(item.stader_revenue);
  });
  dailyFees.addBalances(dailyMaticXFees);
  dailyRevenue.addBalances(dailyMaticXRev);
  
  const dailySupplySideRevenue = dailyFees.clone(1);
  dailySupplySideRevenue.subtract(dailyRevenue);
  
  const dailyProtocolRevenue = dailyRevenue.clone(0.5)
  const dailyHoldersRevenue = dailyRevenue.clone(0.5)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const fetch: Fetch = async (_a: any, _b: any, option: FetchOptions) => {
  const dailyFees = option.createBalances();

  const logs = await option.getLogs({
    target: "0x7276241a669489E4BBB76f63d2A43Bfe63080F2F",
    eventAbi: "event Redelegate (uint256 _rewardsId, uint256 _amount)",
  });
  logs.map((e) => {
    dailyFees.addGasToken(e._amount);
  });

  const dailyRevenue = dailyFees.clone(1 / 9);
  
  const dailySupplySideRevenue = dailyFees.clone(1);
  dailySupplySideRevenue.subtract(dailyRevenue);
  
  const dailyProtocolRevenue = dailyRevenue.clone(0.5)
  const dailyHoldersRevenue = dailyRevenue.clone(0.5)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: "2022-04-12",
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: "2022-07-27",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Staking rewards across all staking pools and blockchains.',
    Revenue: 'There are 10% staking rewards cut as revenue.',
    SupplySideRevenue: 'Stakers earn 90% staking rewards.',
    ProtocolRevenue: 'Staker keeps 80% revenue as protocol revenue.',
    HoldersRevenue: 'Stader executes quarterly buybacks SD utilizing 20% of the revenue generated in the respective quarters.',
  }
};

export default adapter;
