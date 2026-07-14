import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Vectis' fee wallet - manager of all their Drift vaults and admin of all their
// Voltr vaults (fee recipient in both programs). Verified by decoding every vault
// returned by https://api.vectis.finance/strategy/fetchAllVaultAddresses
const FEE_WALLET = "6HmPq4hU2BQqkogVuohggZwaqNFQRpRQ6MSE6bcKxCEa";

const VAULT_PROGRAMS = [
    "vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR", // Drift Vaults - manager profit share + management fee withdrawals
    "EDnxACbdY1GeXnadh5gRuCJnivP7oQSAHGGAHCma4VzG", // Vectis' drift-vaults fork (insurance vault)
    "vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8", // Voltr - admin fee LP redemptions
];

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const query = `
        SELECT token_mint_address AS mint, SUM(amount) AS amount
        FROM tokens_solana.transfers
        WHERE to_owner = '${FEE_WALLET}'
          AND action = 'transfer'
          AND outer_executing_account IN (${VAULT_PROGRAMS.map((p) => `'${p}'`).join(", ")})
          AND TIME_RANGE
        GROUP BY 1
    `;
    const rows = await queryDuneSql(options, query);
    for (const row of rows) {
        dailyFees.add(row.mint, row.amount, "Vault Performance, Management & Withdrawal Fees");
    }
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
    Fees: "Performance fees (10-40% of profits), management fees (up to 2% annual) and withdrawal fees charged by Vectis' vaults, recorded when withdrawn from the vaults (Drift Vaults and Voltr programs) to the Vectis fee wallet. Voltr's own protocol cut (0.5% management fee) is excluded.",
    Revenue: "All Vectis fees (Vault Performance, Management & Withdrawal Fees) are kept by the protocol.",
    ProtocolRevenue: "All Vectis fees (Vault Performance, Management & Withdrawal Fees) are kept by the protocol.",
};

const breakdownMethodology = {
    Fees: {
        "Vault Performance, Management & Withdrawal Fees": "The three fee types accrue inside each vault as one fee pool and are only distinguishable on-chain at accrual, not at collection, so they are reported under a single label when Vectis withdraws them to its fee wallet.",
    },
    Revenue: {
        "Vault Performance, Management & Withdrawal Fees": "The three fee types accrue inside each vault as one fee pool and are only distinguishable on-chain at accrual, not at collection, so they are reported under a single label when Vectis withdraws them to its fee wallet.",
    },
    ProtocolRevenue: {
        "Vault Performance, Management & Withdrawal Fees": "The three fee types accrue inside each vault as one fee pool and are only distinguishable on-chain at accrual, not at collection, so they are reported under a single label when Vectis withdraws them to its fee wallet.",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2024-11-01",
    dependencies: [Dependencies.DUNE],
    methodology,
    breakdownMethodology,
    isExpensiveAdapter: true,
};

export default adapter;
