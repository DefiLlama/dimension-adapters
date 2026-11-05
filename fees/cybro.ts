import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

// ProtocolFeeCollector per chain. LP and auto managers transfer the protocol
// cut here. The collector emits no event on receipt, only when the owner withdraws.
const collectors: Record<string, string> = {
  [CHAIN.ARBITRUM]: "0xfD3BE1d641aDAa64C005dC2D6A2Ff5bEA96AD744",
  [CHAIN.BASE]: "0x567103a40C408B2B8f766016C57A092A180397a1",
  [CHAIN.UNICHAIN]: "0xfB84664E669f8aaE284C626dC7b31c4e45101348",
  [CHAIN.ETHEREUM]: "0xD8287038F3138CE806992915e4E3981c2151d6b9",
  [CHAIN.BSC]: "0xF401483e5D5b7E72AD845634dd7593a307C0Abca",
  [CHAIN.ROBINHOOD]: "0x9AFB3e81C6A38F4D816103251d4ba76D1E62d5d3",
};

const fetch = async (options: FetchOptions) => {
  const received = await addTokensReceived({
    options,
    target: collectors[options.chain],
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Cybro LP and auto managers charge 10 bps when a position is opened, increased, withdrawn or moved, and 10 bps of pool fees that are claimed or compounded. The cut is an ERC-20 transfer into ProtocolFeeCollector.",
  Revenue: "ProtocolFeeCollector keeps the whole cut. Pool fees that stay with the user are not included.",
  ProtocolRevenue: "The collector owner withdraws the balance. The contract does not pay LPs or token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "ERC-20 transfers into ProtocolFeeCollector from Cybro LP and auto managers.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "The full protocol fee is retained by Cybro.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "The full protocol fee is withdrawn by the collector owner.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: { start: "2025-10-03" },
    [CHAIN.BASE]: { start: "2025-10-03" },
    [CHAIN.UNICHAIN]: { start: "2025-10-03" },
    [CHAIN.ETHEREUM]: { start: "2025-12-16" },
    [CHAIN.BSC]: { start: "2025-08-05" },
    [CHAIN.ROBINHOOD]: { start: "2026-08-23" },
  },
};

export default adapter;
