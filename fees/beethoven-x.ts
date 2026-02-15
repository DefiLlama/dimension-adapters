import { Chain } from "../adapters/types";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/balancer";
import { METRIC } from "../helpers/metrics";

type TAddress = {
  [s: string | Chain]: string;
};
const vaultAddresses: TAddress = {
  [CHAIN.OPTIMISM]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  [CHAIN.FANTOM]: "0x20dd72ed959b6147912c2e529f0a0c651c33c9ce",
  [CHAIN.SONIC]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
};

const methodology = {
  Fees: "Beethoven X collects swap fees from liquidity pool trades, flashloan fees from flashloan transactions, and protocol fees from pool operations",
  Revenue: "25% of all fees collected are allocated to the protocol treasury",
  SupplySideRevenue: "75% of all fees collected are distributed to liquidity providers"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees charged on token swaps within liquidity pools, typically ranging from 0.01% to 1% of trade volume depending on pool configuration",
    [METRIC.FLASHLOAN_FEES]: "Fees charged on flashloan transactions executed through the Balancer vault",
    [METRIC.PROTOCOL_FEES]: "Protocol-level fees collected from pool balance changes and operations"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "25% of all swap fees, flashloan fees, and protocol fees retained by the Beethoven X protocol treasury"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "75% of all fees distributed to liquidity providers as compensation for providing liquidity to pools"
  }
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: { fetch: getFeesExport(vaultAddresses[CHAIN.OPTIMISM], { revenueRatio: 0.25 }), start: '2023-01-01' },
    [CHAIN.FANTOM]: { fetch: getFeesExport(vaultAddresses[CHAIN.FANTOM], { revenueRatio: 0.25 }), start: '2023-01-01' },
    [CHAIN.SONIC]: { fetch: getFeesExport(vaultAddresses[CHAIN.SONIC], { revenueRatio: 0.25 }), start: "2024-12-14" },
  },
  methodology,
  breakdownMethodology,
};
export default adapters;
