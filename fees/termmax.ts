import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

/**
 * TermMax Protocol Fees Adapter
 *
 * TermMax is a fixed-rate lending protocol that enables users to borrow/lend at fixed rates.
 * Docs: https://docs.ts.finance/
 *
 * Fee Collection Mechanism:
 * - All protocol fees are collected via ERC20 Transfer events TO the treasury address
 * - We track all token transfers sent to the treasury within the time range
 *
 * Fee Types (distinguished by the source of the transfer):
 * 1. Protocol Fees: Fees from trading orders (borrow/lend transactions)
 *    - Source: FT (Fixed-rate Token) contracts associated with a market
 *    - Detected when: marketAddress lookup succeeds (transfer came from an FT token)
 *    - Valued in: Underlying/debt token (FT is valued 1:1 with underlying at maturity)
 *
 * 2. Liquidation Penalties: Fees charged when undercollateralized positions are liquidated
 *    - Source: GT (Gearing Token) contracts
 *    - Detected when: gtConfig lookup succeeds (transfer came from a GT token)
 *    - Valued in: Collateral token
 */

// Treasury address - same address used across all supported chains
// Supported chains: ethereum, arbitrum, bsc, berachain
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

/**
 * Classifies and sums fees from Transfer logs
 *
 * Classification logic:
 * - For each transfer, we try to identify the source contract type:
 *   1. Call getGtConfig() on the 'from' address - if it succeeds, this is a GT contract
 *      -> The transfer is a liquidation penalty (valued in collateral token)
 *   2. Call marketAddr() on the token address - if it succeeds, this is an FT contract
 *      -> The transfer is a protocol fee (valued in underlying token)
 */
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

  const tuples = [];
  for (let i = 0; i < logs.length; i++) {
    const [gtConfig, marketAddress, balance] = [
      gtConfigs[i],
      marketAddresses[i],
      logs[i].args.value,
    ];
    if (gtConfig) {
      // GT contract -> Liquidation penalty (valued in collateral token)
      dailyUserFees.add(gtConfig.collateral, balance, METRIC.LIQUIDATION_FEES);
    } else if (marketAddress) {
      const log = logs[i];
      tuples.push({ log, marketAddress });
    }
    // Transfers from unknown sources are ignored (not TermMax protocol fees)
  }

  if (tuples.length > 0) {
    const allTokens = await options.api.multiCall({
      // _0: Fixed-rate Token (FT) - bond token for earning fixed income
      // _1: Intermediary Token (XT) - for collateralization and leveraging
      // _2: Gearing Token (GT) - for leveraged positions
      // _3: Collateral token
      // _4: Underlying Token (debt) - we use this for protocol fee valuation
      abi: "function tokens() view returns (address, address, address, address, address)",
      calls: tuples.map((t) => t.marketAddress),
      permitFailure: true,
    });
    for (let i = 0; i < tuples.length; i++) {
      const { log } = tuples[i];
      const tokens = allTokens[i];
      if (tokens && tokens[4]) {
        // FT contract -> Protocol fee (valued in underlying token)
        const underlyingToken = tokens[4];
        const balance = log.args.value;
        dailyUserFees.add(underlyingToken, balance, METRIC.PROTOCOL_FEES);
      }
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
