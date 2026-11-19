import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const OVERSEER = "0xB96f07367e69e86d6e9C3F29215885104813eeAE";
const BPS = 10000n;
const rebaseEvent = "event Rebase(uint256 currentSupply, uint256 newSupply, uint256 rebaseInterval, int256 indexed apr, uint256 indexed currentShareRate, uint256 indexed timeElapsed)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const rebases = await options.getLogs({ target: OVERSEER, eventAbi: rebaseEvent });
  if (rebases.length) {
    // protocolFee changed without emitting ProtocolFeeSet (3% at launch, 6% from 2025-05-20 block 4059691, 10% now),
    // so it is read once per window.
    const protocolFeeBps = BigInt(await options.api.call({ target: OVERSEER, abi: "uint256:protocolFee" }));
    for (const { currentSupply, newSupply } of rebases) {
      const supplySideRevenue = BigInt(newSupply) - BigInt(currentSupply);
      const grossRewards = supplySideRevenue > 0n ? supplySideRevenue * BPS / (BPS - protocolFeeBps) : supplySideRevenue;
      dailyFees.addGasToken(grossRewards, METRIC.STAKING_REWARDS);
      dailyRevenue.addGasToken(grossRewards - supplySideRevenue, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addGasToken(supplySideRevenue, METRIC.STAKING_REWARDS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-02-18",
  methodology: {
    Fees: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
    Revenue: "Protocol fee charged on stHYPE rebases.",
    ProtocolRevenue: "Protocol fee accrued by the stHYPE Overseer contract.",
    SupplySideRevenue: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on stHYPE rebases and accrued by the Overseer contract.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on stHYPE rebases and accrued by the Overseer contract.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
    },
  },
  allowNegativeValue: true, // negative rebases are realized losses passed to stHYPE holders
};

export default adapter;
