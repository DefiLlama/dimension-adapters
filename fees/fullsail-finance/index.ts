import { CHAIN } from '../../helpers/chains';
import { SimpleAdapter, FetchOptions } from '../../adapters/types';
import { METRIC } from '../../helpers/metrics';
import { getOSailExercises, getSwaps } from '../../dexs/fullsail-finance/helper';

// Swap fee split per docs (https://docs.fullsail.finance/exchange/full-sail-mechanics#fee-distribution): 5% insurance fund,
// 95% to veSAIL holders; partner referral fees and the share of unstaked liquidity stay outside that split.
const HOLDERS_FEES = 'Swap Fees To veSAIL Holders';
const INSURANCE_FUND_FEES = 'Swap Fees To Insurance Fund';
const REFERRAL_FEES = 'Swap Fees To Referrers';
const EXERCISE_FEES = 'oSAIL Exercise Fees';
const EXERCISE_HOLDERS_FEES = 'oSAIL Exercise Fees To veSAIL Holders';
const EXERCISE_PROTOCOL_FEES = 'oSAIL Exercise Fees To Protocol';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const swaps = await getSwaps(options);
    const exercises = await getOSailExercises(options);
    for (const { coinIn, fee, holdersFee, protocolFee, refFee } of swaps) {
        const lpFee = fee - holdersFee - protocolFee - refFee;
        if (lpFee < 0n) throw new Error(`Full Sail swap fee split exceeds the fee: ${fee} < ${holdersFee} + ${protocolFee} + ${refFee}`);

        dailyFees.add(coinIn, fee, METRIC.SWAP_FEES);
        dailyRevenue.add(coinIn, holdersFee, HOLDERS_FEES);
        dailyRevenue.add(coinIn, protocolFee, INSURANCE_FUND_FEES);
        dailyHoldersRevenue.add(coinIn, holdersFee, HOLDERS_FEES);
        dailyProtocolRevenue.add(coinIn, protocolFee, INSURANCE_FUND_FEES);
        dailySupplySideRevenue.add(coinIn, lpFee, METRIC.LP_FEES);
        dailySupplySideRevenue.add(coinIn, refFee, REFERRAL_FEES);
    }
    for (const { feeToken, fee, holdersFee, protocolFee } of exercises) {
        if (holdersFee + protocolFee !== fee) throw new Error(`Full Sail oSAIL exercise fee split does not add up: ${fee} != ${holdersFee} + ${protocolFee}`);

        dailyFees.add(feeToken, fee, EXERCISE_FEES);
        dailyRevenue.add(feeToken, holdersFee, EXERCISE_HOLDERS_FEES);
        dailyRevenue.add(feeToken, protocolFee, EXERCISE_PROTOCOL_FEES);
        dailyHoldersRevenue.add(feeToken, holdersFee, EXERCISE_HOLDERS_FEES);
        dailyProtocolRevenue.add(feeToken, protocolFee, EXERCISE_PROTOCOL_FEES);
    }

    return {
        dailyFees,
        dailyUserFees: dailyFees.clone(),
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: 'Dynamic swap fees paid by traders on Full Sail CLMM pools, plus the fees users pay to exercise oSAIL into SAIL.',
    UserFees: 'Dynamic swap fees paid by traders on Full Sail CLMM pools, plus the fees users pay to exercise oSAIL into SAIL.',
    Revenue: 'Swap fees and oSAIL exercise fees kept by the protocol and distributed to veSAIL holders.',
    ProtocolRevenue: 'Swap fees sent to the Full Sail insurance fund (5% of fees net of referral fees) and the protocol share (10%) of oSAIL exercise fees.',
    HoldersRevenue: 'Swap fees (95%) and oSAIL exercise fees (90%) distributed to veSAIL holders, passively and through prediction voting.',
    SupplySideRevenue: 'Swap fees earned by liquidity providers on unstaked positions and fees paid to referral partners.',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: 'Dynamic swap fees paid by traders, charged on the input coin of each swap.',
        [EXERCISE_FEES]: 'Fees paid by users, in USDC, to convert oSAIL emissions into SAIL.',
    },
    Revenue: {
        [HOLDERS_FEES]: 'Swap fees distributed to veSAIL holders.',
        [INSURANCE_FUND_FEES]: 'Swap fees sent to the insurance fund.',
        [EXERCISE_HOLDERS_FEES]: 'oSAIL exercise fees distributed to veSAIL holders.',
        [EXERCISE_PROTOCOL_FEES]: 'oSAIL exercise fees kept by the protocol.',
    },
    ProtocolRevenue: {
        [INSURANCE_FUND_FEES]: 'Swap fees sent to the insurance fund.',
        [EXERCISE_PROTOCOL_FEES]: 'oSAIL exercise fees kept by the protocol.',
    },
    HoldersRevenue: {
        [HOLDERS_FEES]: 'Swap fees distributed to veSAIL holders.',
        [EXERCISE_HOLDERS_FEES]: 'oSAIL exercise fees distributed to veSAIL holders.',
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: 'Swap fees earned by liquidity providers on positions not staked in gauges.',
        [REFERRAL_FEES]: 'Swap fees paid to referral partners that routed the swap.',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2025-05-30',
        },
    },
    methodology,
    breakdownMethodology,
};

export default adapter;
