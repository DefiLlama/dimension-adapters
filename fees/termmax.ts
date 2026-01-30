import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

// chain: ethereum, arbitrum, bsc, berachain
const TREASURY = "0x719e77027952929ed3060dbFFC5D43EC50c1cf79";

async function getTransfers(
  options: FetchOptions,
  _from: string | null,
  _to: string | null,
  fromBlock: number,
  toBlock: number,
) {
  const eventAbi =
    "event Transfer (address indexed from, address indexed to, uint256 value)";
  const from = _from ? ethers.zeroPadValue(_from, 32) : null;
  const to = _to ? ethers.zeroPadValue(_to, 32) : null;
  return await options.getLogs({
    eventAbi,
    topics: [
      // Transfer(address,address,uint256)
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      from as any,
      to as any,
    ],
    fromBlock,
    toBlock,
    entireLog: true,
    noTarget: true,
  });
}

async function handleLogs(options: FetchOptions, logs: any[]) {
  const dailyUserFees = options.createBalances();

  const froms = [];
  const addresses = [];
  for (const log of logs) {
    froms.push(log.args.from);
    addresses.push(log.address);
  }

  const [gtConfigs, marketAddresses] = await Promise.all([
    options.api.multiCall({
      abi: "function getGtConfig() view returns ((address collateral, address debtToken, address ft, address treasurer, uint64 maturity, (address oracle, uint32 liquidationLtv, uint32 maxLtv, bool liquidatable) loanConfig))",
      calls: froms,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "address:marketAddr",
      calls: addresses,
      permitFailure: true,
    }),
  ]);

  const allTokens = await options.api.multiCall({
    // _0: Fixed-rate Token(bond token). Earning Fixed Income with High Certainty
    // _1: Intermediary Token for Collateralization and Leveraging
    // _2: Gearing Token
    // _3: Collateral token
    // _4: Underlying Token(debt)
    abi: "function tokens() view returns (address, address, address, address, address)",
    calls: marketAddresses,
    permitFailure: true,
  });

  for (let i = 0; i < logs.length; i++) {
    const [gtConfig, marketAddress, balance] = [
      gtConfigs[i],
      marketAddresses[i],
      logs[i].args.value,
    ];
    if (gtConfig) {
      // liquidation penalty
      dailyUserFees.add(gtConfig.collateral, balance, METRIC.LIQUIDATION_FEES);
    } else if (marketAddress) {
      // protocol fee
      const tokens = allTokens[i];
      const underlyingToken = tokens[4];
      dailyUserFees.add(underlyingToken, balance, METRIC.PROTOCOL_FEES); // underlying token (debt)
    }
  }

  return { dailyUserFees };
}

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);
  const logs = await getTransfers(options, null, TREASURY, fromBlock, toBlock);

  const { dailyUserFees } = await handleLogs(options, logs);
  dailyRevenue.add(dailyUserFees);

  return {
    dailyUserFees,
    dailyFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Protocol fees (FT valued at underlying 1:1) from trading orders and liquidation penalties (in collateral tokens).",
  UserFees:
    "Protocol fees (FT valued at underlying 1:1) from trading orders and liquidation penalties (in collateral tokens).",
  Revenue:
    "Protocol fees (FT valued at underlying 1:1) from trading orders and liquidation penalties (in collateral tokens).",
  ProtocolRevenue:
    "Protocol fees (FT valued at underlying 1:1) from trading orders and liquidation penalties (in collateral tokens).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
  },
  UserFees: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2025-03-27" },
    [CHAIN.ARBITRUM]: { start: "2025-03-27" },
    [CHAIN.BSC]: { start: "2025-05-28" },
    [CHAIN.BERACHAIN]: { start: "2025-07-08" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
