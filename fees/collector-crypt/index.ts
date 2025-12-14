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
            WHERE to_owner IN ('GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z','GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3','96DULv1BqYfe5wyMr6pVUNC6Uyrtj6yr3tNi6VtfwW9s')
                AND from_owner NOT IN ('BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
                                        '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
                                        'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
                                        'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
                                        'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
                                        'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
                                        'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
                                        'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
                                        'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN',
                                        'Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu',
                                        'miDtj3vgdxVykHzRyFwyG8MXpvK8eQqamSLVdBr7WPt',
                                        'HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb',
                                        'epiC3zkqa1RfcPMMM1Kc8m3GZGDwF2RmjbfA3g1BBjn',
                                        'LGNDfXQFMiRMz3qqTNAREmRFQutMvazqqRrzn5i98uj',
                                        'SPrT7eFrCM9UJ4j7Xf9iktKCoBwJjfykFbiNbRsKQm8')
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
            WHERE from_owner IN ('GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z','GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3')
                AND to_owner NOT IN ('BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
                                    '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
                                    'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
                                    'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
                                    'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
                                    'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
                                    'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
                                    'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
                                    'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN',
                                    'Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu',
                                    'miDtj3vgdxVykHzRyFwyG8MXpvK8eQqamSLVdBr7WPt',
                                    'HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb',
                                    'epiC3zkqa1RfcPMMM1Kc8m3GZGDwF2RmjbfA3g1BBjn',
                                    'LGNDfXQFMiRMz3qqTNAREmRFQutMvazqqRrzn5i98uj',
                                    'SPrT7eFrCM9UJ4j7Xf9iktKCoBwJjfykFbiNbRsKQm8',
                                    'Cc4pHGnoaRWL1WnHsV517T3YvQn5gLDBMiuVXkF9rZhK',
                                    '8373hLiAEXxaJ3oV7SRzx4KHwurEg9rEG98tUPj1sdtX')
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
    allowNegativeValue: true, // fees from marketplace transactions can be lower than gacha buyback expenses
}

export default adapter;
