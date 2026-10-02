import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getSolanaReceived } from "../../helpers/token";

// Ethereum: Nullmask shielded pool (proxy)
const POOL = "0xd64EF1417EB047ed0b54736a5a41F01178C391c6";
const ProtocolFeeCharged = "event ProtocolFeeCharged(uint8 indexed kind, bytes32 indexed ref, address indexed token, uint256 amount)";

// Solana: ZEC holder rewards received by the Nullmask team wallet for holding MASK
const TEAM_WALLET = "FrXTvkebakR2oNctgsHz1yeijmu9wTZifL3FmffJP5xJ";
const ZEC_MINT = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
const REWARDS_DISTRIBUTOR = "HuBMeYW3aDn8BH65fo8xxbP4oiexyup8udzKyccgi8Ga"; // StonkFun ZEC rewards distributor

const HOLDER_REWARDS = "MASK Holder Rewards";

const fetchEthereum = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // kind 0 = deposit (0.5%), kind 1 = withdrawal (0.5%). Relayer gas compensation is not a protocol fee and is not emitted here.
  const logs = await options.getLogs({ target: POOL, eventAbi: ProtocolFeeCharged });
  logs.forEach((log: any) => dailyFees.add(log.token, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES));
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const fetchSolana = async (options: FetchOptions) => {
  const received = await getSolanaReceived({
    options,
    target: TEAM_WALLET,
    mints: [ZEC_MINT],
    fromAddress: REWARDS_DISTRIBUTOR,
  });
  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, HOLDER_REWARDS);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: "2026-10-01" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-09-23" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "0.5% protocol fee on shielded pool deposits and 0.5% on withdrawals (Ethereum), plus ZEC rewards received by the Nullmask team wallet from MASK token holder distributions (Solana).",
    Revenue: "All fees are revenue of the Nullmask team.",
    ProtocolRevenue: "All fees are revenue of the Nullmask team.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.5% protocol fee charged on shielded pool deposits and withdrawals (ProtocolFeeCharged events). Relayer gas compensation is excluded.",
      [HOLDER_REWARDS]: "ZEC rewards received by the Nullmask team wallet from the StonkFun rewards distributor for holding MASK. Other ZEC transfers to the wallet are excluded.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "All shielded pool protocol fees.",
      [HOLDER_REWARDS]: "All ZEC rewards received by the team wallet.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "All shielded pool protocol fees.",
      [HOLDER_REWARDS]: "All ZEC rewards received by the team wallet.",
    },
  },
};

export default adapter;
