import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { pyramidTarget?: string, verificationTarget?: string, start: string }> = {
    [CHAIN.ARBITRUM]: {
        pyramidTarget: "0xa4e6101e26BD7d2C418aDb3bbF3189375678eb99",
        verificationTarget: "0x582062d3D36D21b51d49F6c331fDc2e6A2929BCA",
        start: "2025-09-25",
    },
    [CHAIN.BASE]: {
        pyramidTarget: "0xC909A19E3cE11841d46E9206f5FD9fe2Bc9B36b5",
        verificationTarget: "0xf2bFe2F797B60A3937f4d1bC78A75b9987Ea9493",
        start: "2025-04-04",
    },
    [CHAIN.BSC]: {
        pyramidTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        verificationTarget: "0xa4e6101e26BD7d2C418aDb3bbF3189375678eb99",
        start: "2026-02-24",
    },
    [CHAIN.SONEIUM]: {
        pyramidTarget: "0x30410050CB1eBCF21741c9D3F817C386401f82fd",
        verificationTarget: "0xd61bEFb87833bAf43EE28a15022C19CDb674c204",
        start: "2025-03-19",
    },
    [CHAIN.SONIC]: {
        pyramidTarget: "0xE99F2AEfff9CCff34832747479Bd84658495F50A",
        verificationTarget: "0x30410050CB1eBCF21741c9D3F817C386401f82fd",
        start: "2025-03-27",
    },
    [CHAIN.HYPERLIQUID]: {
        pyramidTarget: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
        verificationTarget: "0x6922A47e04c6c253790fa94EDc4B2fd9e90B64E3",
        start: "2025-06-07",
    },
    [CHAIN.PLUME]: {
        pyramidTarget: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
        verificationTarget: "0x6922A47e04c6c253790fa94EDc4B2fd9e90B64E3",
        start: "2025-06-11",
    },
    [CHAIN.ABSTRACT]: {
        pyramidTarget: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
        verificationTarget: "0x173F63ae500A471d86db16045cb05c13d88afc07",
        start: "2025-06-25",
    },
    [CHAIN.SOMNIA]: {
        pyramidTarget: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
        verificationTarget: "0x4DF24Ab367C801187929FEb2841853DBa40208B0",
        start: "2026-03-25",
    },
    [CHAIN.MONAD]: {
        pyramidTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        verificationTarget: "0x3a6E887C0608f67FA015Bc115f1d76115b29d234",
        start: "2025-11-24",
    },
    [CHAIN.UNICHAIN]: {
        pyramidTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        verificationTarget: "0x1AE93e93A8B421725F114a27c82237BEF4ada624",
        start: "2025-11-25",
    },
    [CHAIN.POLYGON]: {
        verificationTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        start: "2026-03-19",
    },
    [CHAIN.ETHEREUM]: {
        verificationTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        start: "2026-03-19",
    },
    [CHAIN.MEGAETH]: {
        verificationTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        start: "2026-03-20",
    },
    [CHAIN.INK]: {
        verificationTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        start: "2026-03-20",
    },
    [CHAIN.KATANA]: {
        verificationTarget: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
        start: "2026-03-27",
    },
};

const PYRAMID_CLAIM_EVENT =
    "event PyramidClaim(string questId, uint256 indexed tokenId, address indexed claimer, uint256 price, uint256 rewards, uint256 issueNumber, string walletProvider, string embedOrigin)";

const STATUS_UPDATED_EVENT =
    "event StatusUpdated(address indexed user, uint8 oldStatus, uint8 newStatus, uint256 price, uint256 timestamp)";

const METRICS = {
    pyramidFees: "Pyramid Claim Fees",
    pyramidFeesToTreasury: "Pyramid Claim Fees To Treasury",
    verificationFees: "Verification Fees",
    verificationFeesToTreasury: "Verification Fees To Treasury",
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const pyramidTarget = chainConfig[options.chain].pyramidTarget;
    const verificationTarget = chainConfig[options.chain].verificationTarget;

    if (pyramidTarget) {
        const pyramidFeeLogs = await options.getLogs({
            target: pyramidTarget,
            eventAbi: PYRAMID_CLAIM_EVENT,
        });

        for (const log of pyramidFeeLogs) {
            dailyFees.addGasToken(log.price.toString(), METRICS.pyramidFees);
            dailyRevenue.addGasToken(log.price.toString(), METRICS.pyramidFeesToTreasury);
        }
    }

    if (verificationTarget) {
        const verificationFeeLogs = await options.getLogs({
            target: verificationTarget,
            eventAbi: STATUS_UPDATED_EVENT,
        });

        for (const log of verificationFeeLogs) {
            dailyFees.addGasToken(log.price.toString(), METRICS.verificationFees);
            dailyRevenue.addGasToken(log.price.toString(), METRICS.verificationFeesToTreasury);
        }
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "All fees paid by users for Arkada pyramid claims and paid verifications.",
    Revenue: "100% of pyramid claim fees and verification fees are retained by Arkada.",
    ProtocolRevenue: "100% of pyramid claim fees and verification fees are allocated to Arkada treasury.",
};

const breakdownMethodology = {
    Fees: {
        [METRICS.pyramidFees]: "Payments made by users when claiming Arkada pyramids.",
        [METRICS.verificationFees]: "Payments made by users for paid verification status updates.",
    },
    Revenue: {
        [METRICS.pyramidFeesToTreasury]: "All pyramid claim fees retained by Arkada.",
        [METRICS.verificationFeesToTreasury]: "All verification fees retained by Arkada.",
    },
    ProtocolRevenue: {
        [METRICS.pyramidFeesToTreasury]: "All pyramid claim fees allocated to Arkada treasury.",
        [METRICS.verificationFeesToTreasury]: "All verification fees allocated to Arkada treasury.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: chainConfig,
    fetch,
    methodology,
    breakdownMethodology,
};

export default adapter;
