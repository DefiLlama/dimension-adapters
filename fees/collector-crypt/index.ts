import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const query = `
        WITH gacha_in AS (
            SELECT 
                SUM(amount / POWER(10, 6)) AS inflow
            FROM tokens_solana.transfers
            WHERE to_owner = 'GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z'
                AND from_owner NOT IN (
                    'BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
                    '8373hLiAEXxaJ3oV7SRzx4KHwurEg9rEG98tUPj1sdtX',
                    '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
                    'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
                    'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
                    'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
                    'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
                    'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
                    'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
                    'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN'
                )
                AND amount / power(10, 6) IN (50, 250)
                AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
                AND TIME_RANGE
        ),
        fees AS (
            SELECT 
                SUM(amount / POWER(10, 6)) AS inflow
            FROM tokens_solana.transfers
            WHERE to_owner = 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd'
                AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
                AND TIME_RANGE
        ),
        buyback AS (
            SELECT 
                SUM(amount / POWER(10, 6)) AS buyback
            FROM tokens_solana.transfers
            WHERE from_owner = 'GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z'
                AND to_owner NOT IN (
                    'BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
                    '8373hLiAEXxaJ3oV7SRzx4KHwurEg9rEG98tUPj1sdtX',
                    '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
                    'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
                    'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
                    'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
                    'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
                    'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
                    'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
                    'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN'
                )
                AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
                AND TIME_RANGE
            )
        SELECT 
            COALESCE(g.inflow, 0) AS gacha_spend,
            COALESCE(f.inflow, 0) AS fees_royalty,
            COALESCE(b.buyback, 0) AS buyback,
            COALESCE(g.inflow, 0) + COALESCE(f.inflow, 0) - COALESCE(b.buyback, 0) AS net_revenue
        FROM gacha_in g
            CROSS JOIN fees f
            CROSS JOIN buyback b;
    `;
    
    const data = await queryDuneSql(options, query);
    
    if (data && data.length > 0) {
        const result = data[0];
        const netRevenue = result.net_revenue || 0;        
        dailyFees.addUSDValue(netRevenue);
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
    Fees: "Total fees from gacha (card pack sales) and marketplace transactions.",
    Revenue: "Revenue from gacha sales + marketplace fees/royalties.",
    UserFees: "Total fees paid by users for gacha and marketplace transactions.",
    ProtocolRevenue: "Net revenue after accounting for gacha buyback expenses."
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-06-04',
    dependencies: [Dependencies.DUNE],
    methodology,
}

export default adapter;