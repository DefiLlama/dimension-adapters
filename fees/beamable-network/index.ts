import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { queryDuneSql } from "../../helpers/dune";

const TREASURY_PDA = '6pZERJjcMpNjPZ6ovnXWC6LzwkXLAYgAR1URAEs63cWC';

const fetch = async (_a: any, _b:any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const query = `
    WITH calls AS (
      SELECT tx_id, block_slot, block_time
      FROM solana.instruction_calls
      WHERE executing_account = 'WSTKhDg9nQ8h2ZmnmNdR6heSGU6uYJSwdUNpzSYXBSe'
        AND tx_success = true
        AND substr(data, 1, 1) = 0x0b
        AND block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
    )
    SELECT
      t.to_owner,
      t.amount
    FROM tokens_solana.transfers t
    JOIN calls c ON t.tx_id = c.tx_id
    WHERE t.block_time >= from_unixtime(${options.fromTimestamp})
      AND t.block_time < from_unixtime(${options.toTimestamp})
      AND t.token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    ORDER BY t.block_slot DESC
  `;

    const results = await queryDuneSql(options, query, { extraUIDKey: 'beamable-network' });

    // Process results
    for (const row of results) {
        const amount = row.amount;

        // Add to total fees
        dailyFees.add(ADDRESSES.solana.USDC, amount);

        // Separate between holders revenue (treasury PDA) and supply side revenue (workers)
        if (row.to_owner === TREASURY_PDA) {
            dailyHoldersRevenue.add(ADDRESSES.solana.USDC, amount);
        } else {
            dailySupplySideRevenue.add(ADDRESSES.solana.USDC, amount);
        }
    }

    const dailyRevenue = dailyHoldersRevenue.clone();

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue: 0, // All revenue is distributed
    };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-11-13',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Fees: "Total USDC payments from users for compute services",
        Revenue: "Portion of fees distributed to the protocol and to BMB stakers",
        SupplySideRevenue: "Portion of fees paid to worker nodes for providing compute services",
        HoldersRevenue: "Portion of fees for distribution to BMB stakers",
        ProtocolRevenue: "Portion of fees retained by the protocol",
    }
};

export default adapter;
