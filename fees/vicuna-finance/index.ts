import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { addTokensReceived } from '../../helpers/token';

// total harvest strategy fee is 7%
const totalFee = 7;
// call fee is 0.05%
const callFee = 0.05;
// 6.95% of the total fee goes to the vault
const vaultFee = totalFee - callFee;
// 50% of the harvest fee goes to Governance users
const governanceShare = totalFee / 2;

const adapter: Adapter = {
    methodology: {
        Fees: `${totalFee}% of each harvest is charged as a performance fee, with 50% of the fee going to Governance users.`,
        Revenue: `All fees except for ${callFee}% to call fee are considered revenue. 50% of the fee goes to Governance users and is excluded from protocol revenue.`,
    },
    adapter: {
        [CHAIN.SONIC]: {
            fetch: async (options: FetchOptions) => {
                const tokens = [ADDRESSES.sonic.wS]; //wS
                const targets = ['0xad1bB693975C16eC2cEEF65edD540BC735F8608B'];

                const dailyRevenue = await addTokensReceived({ options, targets, tokens });
                const dailyFees = dailyRevenue.clone(totalFee / vaultFee); // Total fees = protocol revenue * (7/6.95)
                const dailyProtocolRevenue = dailyRevenue.clone(vaultFee / totalFee); // Vault share of the revenue
                const governanceRevenue = dailyRevenue.clone(governanceShare / totalFee); // Governance share of the revenue

                return { dailyFees, dailyRevenue, dailyProtocolRevenue };
            },
            start: '2025-01-02',
        }
    },
    version: 2,
};

export default adapter;
