import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

// Collector Crypt addresses
const GACHA_ADDRESS = 'GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z';
const FEES_ADDRESS = 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd';

// Excluded addresses (internal transfers)
const EXCLUDED_ADDRESSES = [
    'BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
    '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
    'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
    'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
    'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
    'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
    'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
    'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
    'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN'
];

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const query = `
        SELECT 
            -- Gacha revenue: transfers TO gacha address with specific amounts
            SUM(CASE 
                WHEN to_owner = '${GACHA_ADDRESS}' 
                AND from_owner NOT IN (${EXCLUDED_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
                AND amount / power(10, 6) IN (50, 250)
                THEN amount / power(10, 6) 
                ELSE 0 
            END) as gacha_revenue,
            
            -- Fees revenue: transfers TO fees address
            SUM(CASE 
                WHEN to_owner = '${FEES_ADDRESS}'
                THEN amount / power(10, 6) 
                ELSE 0 
            END) as fees_revenue,
            
            -- Buyback expense: transfers FROM gacha address (excluding internal)
            SUM(CASE 
                WHEN from_owner = '${GACHA_ADDRESS}' 
                AND to_owner NOT IN (${EXCLUDED_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
                THEN amount / power(10, 6) 
                ELSE 0 
            END) as buyback_expense
        FROM tokens_solana.transfers
        WHERE 
            TIME_RANGE
            AND token_mint_address = '${ADDRESSES.solana.USDC}'
            AND (
                (to_owner = '${GACHA_ADDRESS}' AND from_owner NOT IN (${EXCLUDED_ADDRESSES.map(addr => `'${addr}'`).join(', ')})) OR
                (to_owner = '${FEES_ADDRESS}') OR
                (from_owner = '${GACHA_ADDRESS}' AND to_owner NOT IN (${EXCLUDED_ADDRESSES.map(addr => `'${addr}'`).join(', ')}))
            )
    `;
    
    const data = await queryDuneSql(options, query);
    
    if (data && data.length > 0) {
        const result = data[0];
        
        // Calculate total revenue and net revenue
        const totalRevenue = (result.gacha_revenue || 0) + (result.fees_revenue || 0);
        const netRevenue = totalRevenue - (result.buyback_expense || 0);
        
        // Add total revenue (gacha + marketplace fees)
        if (totalRevenue > 0) {
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
    methodology,
}

export default adapter;