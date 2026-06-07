import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Render Network — Burn-Mint Equilibrium (BME) fee tracking on Solana.
// References:
//   - RNP-001 (Burn-Mint Equilibrium): https://github.com/rendernetwork/RNPs/blob/main/RNP-001.md
//   - Burn-Mint Equilibrium overview:  https://know.rendernetwork.com/basics/burn-mint-equilibrium
//   - RNDR → RENDER (Solana) FAQ:      https://know.rendernetwork.com/general-render-network/rndr-to-render-what-you-need-to-know
//

const RENDER_CG_ID = "render-token";
const RENDER_MINT = "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof";
const BURN_WALLET = "rbrnm7nPhfhBxPSh8qhRFrhB5MLnJGMNoyNQPvSi7vq";
const SERVICE_FEE_RATE = 0.05;

const LABEL = {
  RenderJobs: "Render Job Payments",
  RenderBurn: "Job Payments to $RENDER burn",
  ServiceFees: "Service Fees to OTOY",
};

interface DailyBurn {
  render_burnt: number;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const query = `
    SELECT 
      COALESCE(SUM(amount) / 1e8, 0) AS render_burnt
    FROM tokens_solana.transfers
    WHERE token_mint_address = '${RENDER_MINT}'
      AND from_owner = '${BURN_WALLET}'
      AND action = 'burn'
      AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND block_time <  FROM_UNIXTIME(${options.endTimestamp})
  `;
  const data: DailyBurn[] = await queryDuneSql(options, query);

  const renderBurnt = data[0].render_burnt;
  if (renderBurnt > 0) {
    const grossJobPayment = renderBurnt * (1 / (1 - SERVICE_FEE_RATE));
    dailyFees.addCGToken(RENDER_CG_ID, grossJobPayment, LABEL.RenderJobs);
    dailyHoldersRevenue.addCGToken(RENDER_CG_ID, renderBurnt, LABEL.RenderBurn);
    dailyProtocolRevenue.addCGToken(RENDER_CG_ID, grossJobPayment * SERVICE_FEE_RATE, LABEL.ServiceFees);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees:
    "Gross user-paid spend on render jobs under the Burn-Mint Equilibrium model " +
    "(RNP-001). Each job is priced in USD; an equivalent USD value of RENDER is " +
    "burned on the Solana SPL mint by the burn wallet. The on-chain burn represents the 95% " +
    "node-operator side of gross job spend; gross fees are derived by dividing " +
    "the burn value by 0.95. The remaining 5% Network Operator service fee is " +
    "paid to OTOY off-chain per the Foundation's documented fee schedule and is " +
    "not directly observed in the on-chain burn stream. Legacy Ethereum RNDR " +
    "(pre-2023-11-02 Solana migration) is out of scope.",
  Revenue: " Includes 5% service fees paid to OTOY (company that created RENDER) and 95% of the fees that is burnt",
  ProtocolRevenue: "Includes 5% service fees paid to OTOY (company that created RENDER)",
  HoldersRevenue: "Includes 95% of the fees that is burnt",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.RenderJobs]:
      "Gross user-paid USD spend on render jobs under Burn-Mint Equilibrium (RNP-001). " +
      "Derived from on-chain SPL burns (burn amount ÷ 0.95), since burns represent the 95% node-operator share.",
  },
  Revenue: {
    [LABEL.RenderJobs]:
      "Gross user-paid USD spend on render jobs, including the 95% burn allocation and the 5% OTOY service fee. " +
      "Derived from on-chain SPL burns (burn amount ÷ 0.95).",
  },
  ProtocolRevenue: {
    [LABEL.ServiceFees]:
      "5% Network Operator service fee paid to OTOY for infrastructure maintenance (derived from burn × 0.05).",
  },
  HoldersRevenue: {
    [LABEL.RenderBurn]:
      "95% of gross job fees allocated to $RENDER burn on Solana (observed as SPL burns from the burn wallet).",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-01-08",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
