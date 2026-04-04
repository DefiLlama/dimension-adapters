import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi = {
  nameRegistered:
    "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires,bool isBTC)",
  nameRenewed:
    "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires,bool isBTC,address indexed sender)",
};

const controller = "0xa08728ca65b6b980059dB463AD2714dfffa848cf";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const registrations = await options.getLogs({
    target: controller,
    eventAbi: abi.nameRegistered,
  });

  registrations.forEach((tx: any) => {
    dailyFees.addGasToken(tx.baseCost + tx.premium, "Name registration fees");
  });

  const renewals = await options.getLogs({
    target: controller,
    eventAbi: abi.nameRenewed,
  });

  renewals.forEach((tx: any) => {
    dailyFees.addGasToken(tx.cost, "Name renewal fees");
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Namoshi .citrea and .btc domain name registration and renewal costs",
  Revenue: "Namoshi .citrea and .btc domain name registration and renewal costs",
  ProtocolRevenue: "Namoshi .citrea and .btc domain name registration and renewal costs",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CITREA],
  start: "2026-01-23",
  methodology,
  breakdownMethodology: {
    Fees: {
      "Name registration fees": "cBTC paid for .citrea and .btc name registrations, including base cost and premium.",
      "Name renewal fees": "cBTC paid for .citrea and .btc name renewals.",
    },
    Revenue: {
      "Name registration fees": "cBTC paid for .citrea and .btc name registrations, including base cost and premium.",
      "Name renewal fees": "cBTC paid for .citrea and .btc name renewals.",
    },
    ProtocolRevenue: {
      "Name registration fees": "cBTC paid for .citrea and .btc name registrations, including base cost and premium.",
      "Name renewal fees": "cBTC paid for .citrea and .btc name renewals.",
    },
  },
};

export default adapter;
