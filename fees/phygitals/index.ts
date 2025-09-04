import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    
    const query = `
        SELECT 
            SUM(
              CASE 
                WHEN to_owner = '62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS' 
                     AND from_owner NOT IN ('42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e', '5sn2nniGv88bxzxBDkqWP6i8bejsr9WwCpZXq2ZkLHgf')
                THEN amount / 1e6
                ELSE 0
              END
            ) AS gacha_spend,
            
            SUM(
              CASE 
                WHEN to_owner = '42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e' 
                     AND from_owner NOT IN ('62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS', '5sn2nniGv88bxzxBDkqWP6i8bejsr9WwCpZXq2ZkLHgf')
                THEN amount / 1e6
                ELSE 0
              END
            ) AS gacha_spend1,

            SUM(
              CASE 
                WHEN to_owner = '4SabGkbLc9uxzrq4f1Es9tJPZfHVzP28kwSosR2sYJRt' 
                     AND from_owner NOT IN ('42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e', '5sn2nniGv88bxzxBDkqWP6i8bejsr9WwCpZXq2ZkLHgf')
                THEN amount / 1e6
                ELSE 0
              END
            ) AS luckydraw_fees,

            SUM(
              CASE 
                WHEN to_owner = '2CEe9G68EqWmer21DhRhxJ3coUvRspDxT9NJuc2PJYo5' 
                     AND from_owner NOT IN ('42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e', '5sn2nniGv88bxzxBDkqWP6i8bejsr9WwCpZXq2ZkLHgf')
                THEN amount / 1e6
                ELSE 0
              END
            ) AS royalties,

            SUM(
              CASE 
                WHEN from_owner = '62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS' 
                     AND to_owner NOT IN ('42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e', '5sn2nniGv88bxzxBDkqWP6i8bejsr9WwCpZXq2ZkLHgf')
                THEN amount / 1e6
                ELSE 0
              END
            ) AS buyback
        FROM tokens_solana.transfers
        WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            AND TIME_RANGE
            AND (
              to_owner IN (
                '62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS',
                '4SabGkbLc9uxzrq4f1Es9tJPZfHVzP28kwSosR2sYJRt',
                '2CEe9G68EqWmer21DhRhxJ3coUvRspDxT9NJuc2PJYo5',
                '42oNTirN62M3MkA52KiTTGyf9RnDh2YvqNdpFSgkf97e'
              ) 
              OR from_owner = '62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS'
            )
    `;
    
    const data = await queryDuneSql(options, query);
    
    if (data && data.length > 0) {
        const result = data[0];
        const gachaTotalSpend = (result.gacha_spend || 0) + (result.gacha_spend1 || 0);
        const totalRevenue = gachaTotalSpend + (result.luckydraw_fees || 0) + (result.royalties || 0);
        const netRevenue = totalRevenue - (result.buyback || 0);        
        dailyFees.add(ADDRESSES.solana.USDC, netRevenue * 1e6);
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
    start: '2025-03-16',
    methodology,
}

export default adapter;