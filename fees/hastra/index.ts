import { FetchOptions, SimpleAdapter,Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const WYLDS_MINT = "8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT
      SUM(amount_display) AS total_minted
    FROM tokens_solana.transfers
    WHERE
      token_mint_address = '${WYLDS_MINT}'
      AND action = 'mint'
      AND TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);
  const totalMinted = Number(result?.[0]?.total_minted ?? 0);

  if (totalMinted > 0) {
    dailyFees.addUSDValue(totalMinted);
    dailySupplySideRevenue.addUSDValue(totalMinted);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: options.createBalances(),
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees: "All wYLDS tokens minted on-chain, representing real-world yield from Figure's HELOC lending pools distributed to wYLDS holders and PRIME stakers.",
  UserFees: "Yield paid by underlying HELOC borrowers, passed on-chain as newly minted wYLDS to token holders.",
  SupplySideRevenue: "100% of minted wYLDS accrues to wYLDS holders and PRIME stakers. PRIME stakers earn enhanced yield via the increasing wYLDS-per-PRIME exchange rate.",
  Revenue: "Hastra takes no on-chain protocol fee cut. Figure monetises via off-chain lending spreads on HELOCs.",
};

const breakdownMethodology = {
  Fees: {
    "HELOC Lending Yield": "wYLDS minted each epoch representing yield from Figure's Demo Prime HELOC real estate lending operations.",
  },
  UserFees: {
    "HELOC Lending Yield": "Yield originated from real estate borrowers paying interest on Figure's HELOC lending pools.",
  },
  SupplySideRevenue: {
    "HELOC Lending Yield To Holders": "All minted wYLDS distributed to wYLDS holders and PRIME stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-21",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;