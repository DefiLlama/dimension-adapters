import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const query = `
        WITH filtered_transfers AS (
          SELECT
            token_mint_address,
            from_owner,
            to_owner,
            amount / 1e6 AS amount
          FROM tokens_solana.transfers
          WHERE 
            TIME_RANGE
            AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            AND (
              to_owner = 'pokeWdogfsZSHgENrgEzax8U168X6ynBFkEKPvRUZsy'
              OR from_owner = 'pokeWdogfsZSHgENrgEzax8U168X6ynBFkEKPvRUZsy'
            )
            AND from_owner NOT IN ('2ECYkadmGLG8Aze4Jo1kSrEFz1EFoU5zuFjW26GGN2hm', '4L3KprXYzaquGXAo4D2FWjewFd3xEhJZEiiCfurXQdpv','eMp3NLDixLVZSKVJbZvjprUk5joinjkNXaZBNSvQuWf')
            AND to_owner NOT IN ('2ECYkadmGLG8Aze4Jo1kSrEFz1EFoU5zuFjW26GGN2hm', '4L3KprXYzaquGXAo4D2FWjewFd3xEhJZEiiCfurXQdpv','eMp3NLDixLVZSKVJbZvjprUk5joinjkNXaZBNSvQuWf')
        ),

        gacha_in AS (
          SELECT
            SUM(amount) AS gacha_spend
          FROM filtered_transfers
          WHERE to_owner = 'pokeWdogfsZSHgENrgEzax8U168X6ynBFkEKPvRUZsy'
          AND amount in (50,60)
        ),

        buyback AS (
          SELECT
            SUM(amount) AS buyback
          FROM filtered_transfers
          WHERE from_owner = 'pokeWdogfsZSHgENrgEzax8U168X6ynBFkEKPvRUZsy'
        )

        SELECT
          COALESCE(g.gacha_spend, 0) AS gacha_spend,
          COALESCE(b.buyback, 0) AS buyback,
          COALESCE(g.gacha_spend, 0) - COALESCE(b.buyback, 0) AS net_revenue
        FROM gacha_in g
        CROSS JOIN buyback b
    `;
    
    const data = await queryDuneSql(options, query);
    
    if (data && data.length > 0) {
        const result = data[0];
        const netRevenue = result.net_revenue || 0;        
        if (netRevenue > 0) {
            dailyFees.add(ADDRESSES.solana.USDC, netRevenue * 1e6);
        }
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailyHoldersRevenue: '0',
    }
}

const methodology = {
    Fees: "Total fees from gacha (card pack sales).",
    Revenue: "Revenue from gacha sales.",
    UserFees: "Total fees paid by users for gacha.",
    ProtocolRevenue: "Net revenue after accounting for gacha buyback expenses."
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: '2025-05-20',
    methodology,
}

export default adapter;