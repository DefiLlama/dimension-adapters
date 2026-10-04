/*
METHODOLOGY:
Graphite Protocol is part of a joint venture with LetsBONK.fun on Solana.

Revenue is distributed as follows (Source: https://revenue.letsbonk.fun/):

Before 1749513600:
Holders Revenue (43% of total Letsbonk share, 7.6% of total Graphite share):
- Buy/Burn (35% of total): BONK tokens are purchased and burned - Letsbonk: 35%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.67% of total): Protocol treasury - Graphite: 7.67%

Protocol Revenue (56.8% of total, split between Letsbonk and Graphite):
- BONKsol Staking (30% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 30%
- Hiring/Growth (7.67% of total): Team expansion - Graphite: 7.67%
- Development/Integration (7.67% of total): Technical development - Graphite: 7.67%
- Marketing (4% of total): Platform promotion - Graphite: 4%, Bonk: 2%

After 1749513600:
Holders Revenue (58% of total Letsbonk share, 7.67% of total Graphite share):
- Buy/Burn (50% of total): BONK tokens are purchased and burned - Letsbonk: 50%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.67% of total): Protocol treasury - Graphite: 7.67%

Protocol Revenue (42% of total, split between Letsbonk and Graphite):
- BONKsol Staking (15% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 15%
- Hiring/Growth (7.67% of total): Team expansion - Graphite: 7.67%
- Development/Integration (7.67% of total): Technical development - Graphite: 7.67%
- Marketing (4% of total): Platform promotion - Graphite: 2%, Bonk: 2%

Graphite's Holders Revenue is not the flat 7.67% GP Reserve share: it is the GP that Graphite buys back
on Jupiter and burns, read on-chain from the burns of the buyback wallets (GP_BUYBACK_WALLETS).
Protocol Revenue is Graphite's whole share minus those burns.

*/

import { CHAIN } from '../../helpers/chains'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { getSolanaReceived } from '../../helpers/token'
import { queryAllium } from '../../helpers/allium'
import { METRIC } from '../../helpers/metrics'

const PERCENTAGE_CHANGE_TIMESTAMP = 1749513600;

const PLATFORM_FEE_WALLET = '56XVRVAsgWv6ADaxzoNnbL38LMoWKM5WiSAhrAWUbd2p';

const GP_MINT = '31k88G5Mq7ptbRDf3AM13HAq6wRQHXHikR8hik7wPygk';

const GP_BUYBACK_WALLETS = [
    'QPKJCvwZNMLnShg6nrEnVPt32u9j5Psdufy2cBoiSi1', // Jupiter DCA buys May-Aug 2025, burned 2,677,602 GP on 2025-08-15: 2XGzyuuHuqzM1ftK4q98u7ETD9p8HDotdVyPArxKM7UBGYDUUkh1QqSjxa7rKosfiXr6uSA633e3Pce3MVQ5ZDD7
    'FEpURmWh74uPi1TdoTk1vvVjfCaumZ6LjWQkiBYGfLwY', // received 100,000 GP from the wallet above and burned it a minute later: 3ui9oxJdnX14GJNQyaQ23Bwr5FfTwCu7hHyKX8B7tvnzDq26KvVpeMkMaXENc6Zwz4v8VJjyrUc4RfCHnHxwsWSs
    'Ei22NX7XDgKqsTVU853jzMLaMceJNqNXohNGKqtn6obV', // Jupiter buys since Aug 2025; its 2026 burns add up to the 685,880 GP Graphite announced in May 2026: 5maxvufptCo9LUEHfmnwdCz32QjPtacQ9ygej9PZV6w86qSdAEQZgn7GNUNdZL1XSJqRE9TeArAAR42dCGgzmbYf
];

const fetch = async (options: FetchOptions) => {
    const platformFees = await getSolanaReceived({ options, target: PLATFORM_FEE_WALLET })

    // Determine Graphite's share based on timestamp
    let graphiteTotalPercentage: number;

    if (options.startTimestamp >= PERCENTAGE_CHANGE_TIMESTAMP) {
        // After percentage change: Graphite gets GP Reserve 7.67% + BONKsol Staking 15% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 2% = 40%
        graphiteTotalPercentage = 0.40;
    } else {
        // Before percentage change: Graphite gets GP Reserve 7.67% + BONKsol Staking 30% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 4% = 57.68%
        graphiteTotalPercentage = 0.5768;
    }

    const dailyFees = platformFees.clone(graphiteTotalPercentage, 'BonkFun Trading Fees')
    const dailyRevenue = platformFees.clone(graphiteTotalPercentage, 'BonkFun Trading Fees')
    const dailyProtocolRevenue = platformFees.clone(graphiteTotalPercentage, 'BonkFun Trading Fees To Treasury')

    const dailyHoldersRevenue = options.createBalances()
    const burns = await queryAllium(`
        SELECT SUM(raw_amount) AS amount
        FROM solana.assets.transfers
        WHERE mint = '${GP_MINT}'
          AND type IN ('burn', 'burnChecked')
          AND from_address IN (${GP_BUYBACK_WALLETS.map(a => `'${a}'`).join(', ')})
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `)
    if (burns[0]?.amount) dailyHoldersRevenue.add(GP_MINT, burns[0].amount, METRIC.TOKEN_BUY_BACK)

    dailyProtocolRevenue.subtract(dailyHoldersRevenue, 'BonkFun Trading Fees To Treasury')

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    //pullHourly: true,
    dependencies: [Dependencies.ALLIUM],
    fetch,
    start: '2025-04-27',
    chains: [CHAIN.SOLANA],
    methodology: {
        Fees: "Graphite Protocol's portion of joint venture fees with Letsbonk. Before 10th jun 2025: 57.68% of total fees. After 10th jun 2025: 40% of total fees.",
        Revenue: "All of Graphite Protocol's portion of the joint venture fees with Letsbonk.fun.",
        ProtocolRevenue: "Graphite Protocol's portion of the joint venture fees with Letsbonk.fun minus the GP bought back and burned. Negative on burn days, as one burn covers weeks of buybacks.",
        HoldersRevenue: "GP that Graphite bought back on Jupiter and burned, valued at the GP price when burned. Buybacks are counted on the day of the burn, which can be weeks after the purchase.",
    },
    breakdownMethodology: {
        Fees: {
            'BonkFun Trading Fees': "Graphite Protocol's portion of the platform trading fees collected by LetsBONK.fun.",
        },
        Revenue: {
            'BonkFun Trading Fees': "Graphite Protocol's portion of the platform trading fees collected by LetsBONK.fun.",
        },
        ProtocolRevenue: {
            'BonkFun Trading Fees To Treasury': "Graphite Protocol's whole portion of the trading fees: GP Reserve, BONKsol staking, hiring/growth, development/integration and marketing minus the GP bought back and burned.",
        },
        HoldersRevenue: {
            [METRIC.TOKEN_BUY_BACK]: "GP bought back on Jupiter by Graphite's buyback wallets and burned.",
        },
    },
    allowNegativeValue: true, // protocol revenue nets out GP burns, and one burn covers weeks of buys (2.9M GP on 2025-08-15)
    doublecounted: true
};

export default adapter;