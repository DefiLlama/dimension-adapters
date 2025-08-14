import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const sdk = require('@defillama/sdk')
import { METRIC } from "../../helpers/metrics";

const HBUSDT_PRICE_AGGREGATOR = "0xAc3d811f5ff30Aa3ab4b26760d0560faf379536A";
const HBUSDT = "0x5e105266db42f78FA814322Bce7f388B4C2e61eb"
const HBXAUT_PRICE_AGGREGATOR = "0xf3dB9f59f9C90495D1c9556fC5737A679720921d"
const HBXAUT = "0x6EB6724D8D3D4FF9E24d872E8c38403169dC05f8"
const HBLSTHYPE_PRICE_AGGREGATOR = "0x2b959a9Deb8e62FaaEA1b226F3bbcbcC0Af31560"
const HBLSTHYPE = "0x81e064d0eB539de7c3170EDF38C1A42CBd752A76"
const BEHYPE_PRICE_AGGREGATOR = "0x1CeaB703956e24b18a0AF6b272E0bF3F499aCa0F"
const BEHYPE = "0x441794D6a8F9A3739F5D4E98a728937b33489D29"
const HBHYPE = "0x96C6cBB6251Ee1c257b2162ca0f39AA5Fa44B1FB"
const HBHYPE_PRICE_AGGREGATOR = "0xDb924A25BfF353f98B066F692c38C3cFacb3a601"
const hbBTC = "0xc061d38903b99aC12713B550C2CB44B221674F94"
const hbBTC_PRICE_AGGREGATOR = "0x9ED559c2Ad1562aE8e919691A84A3320f547B248"





// Morpho Blue (Hyperliquid) config
const MORPHO_BLUE_HYPERLIQUID = "0x68e37dE8d93d3496ae143F2E900490f6280C57cD";
const MORPHO_FROM_BLOCK_HYPERLIQUID = 1988429;

const MorphoBlueAbis = {
    AccrueInterest: "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
    CreateMarket: "event CreateMarket(bytes32 indexed id, tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
};

// Morpho market allowlist from Hyperbeat config (only consider these markets)
const MORPHO_MARKET_ALLOWLIST: string[] = [
    "0xa24d04c3aff60d49b3475f0084334546cbf66182e788b6bf173e6f9990b2c816",
    "0xa62327642e110efd38ba2d153867a8625c8dc40832e1d211ba4f4151c3de9050",
    "0xb5b575e402c7c19def8661069c39464c8bf3297b638e64d841b09a4eb2807de5",
    "0x31aaa663d718e83ea15326ec110c4bcf5e123585d0b6c4d0ad61a50c4aa65b1e",
    "0x5ef35fe4418a6bcfcc70fe32efce30074f22e9a782f81d432c1e537ddbda11e2",
    "0x964e7d1db11bdf32262c71274c297dcdb4710d73acb814f04fdca8b0c7cdf028",
    "0xa7fe39c692f0192fb2f281a6cc16c8b2e1c8f9b9f2bc418e0c0c1e9374bf4b04",
    "0xe41ace68f2de7be8e47185b51ddc23d4a58aac4ce9f8cc5f9384fe26f2104ec8",
    "0xb142d65d7c624def0a9f4b49115b83f400a86bd2904d4f3339ec4441e28483ea",
    "0x5ecb7a25d51c870ec57f810c880e3e20743e56d0524575b7b8934a778aaec1af",
    "0xaba6ad3c2adbae92e6fa0d9cc76e443705bb1ba0c85ba2d1ee4de9890a6c9cf4",
    "0xbc15a1782163f4be46c23ac61f5da50fed96ad40293f86a5ce0501ce4a246b32",
    "0x19bbcc95b876740c0765ed1e4bac1979c4aea1b4bfbfee0e61dc1fe76a6887dc",
    "0x216bd19960f140177a4a3fb9cf258edcbadb1f5d54740fc944503bff4a00e65e",
    "0xe0ede98b4425285a9c93d51f8ba27d9a09bc0033874e4a883d3f29d41f9f2e4a",
    "0xdb2cf3ad3ef91c9bb673bf35744e7141bc2950b27a75c8d11b0ead9f6742d927",
    "0x2b62c4153d81d5b5a233d1d2b7ef899d3fca4076d458e215ff3a00176b415b0d",
    "0xc59a3f8a3918d89ebef44ee1dcda435719f543cfd3f37ead7e74852ea5931581",
    "0x65f2a559764859a559d8c39604cf665942bab7d10dfaa1b82e914c9d351038d4",
    "0x27eb6eacceff68d38334f7eb2076820826f6d202a76779e349cd6831d5af6121",
    "0x4a9a84a2760a4579ef9d8ad5eebc073f0606ff49d7cabcbdd07c6c49157f9abd",
    "0x6939b6a766a04439e4b1a948e4142a936be7a42b850dd32ad01d61236582a23c",
    "0x5031ac4543f8232df889e5eb24389f8cf9520366f21dc62240017cb3bc6ecc59",
    "0x2acd218c67daa94dd2f92e81f477ffc9f8507319f0f2d698eae5ed631ae14039",
    "0xc5526286d537c890fdd879d17d80c4a22dc7196c1e1fff0dd6c853692a759c62",
    "0x7268244d330f1462f77ded7a14e2f868893e86e76e8b8eaa869405d588aff6ce",
    "0x19e47d37453628ebf0fd18766ce6fee1b08ea46752a5da83ca0bfecb270d07e8",
    "0x0bb2900086fe38fa9633c664e1f955eb8dcf66a81174967e83dee867e083a105",
    "0x1da89208e6cb5173e97a83461853b8400de4f7c37542cf010a10579a5f7ca451",
    "0x8eb8cfe3b1ac8f653608ae09fb099263fa2fe25d4a59305c309937292c2aeee9",
];

type MorphoMarket = {
    marketId: string;
    loanAsset: string;
};

async function fetchMorphoMarketsOnHyperliquid(options: FetchOptions): Promise<Array<MorphoMarket>> {
    const events = await options.getLogs({
        target: MORPHO_BLUE_HYPERLIQUID,
        eventAbi: MorphoBlueAbis.CreateMarket,
        fromBlock: MORPHO_FROM_BLOCK_HYPERLIQUID,
    });

    const allow = new Set(MORPHO_MARKET_ALLOWLIST.map((s) => s.toLowerCase()));
    const markets: Array<MorphoMarket> = [];
    for (const ev of events) {
        const id = String(ev.id).toLowerCase();
        if (!allow.size || allow.has(id)) {
            markets.push({
                marketId: ev.id,
                loanAsset: ev.marketParams.loanToken,
            });
        }
    }

    return markets;
}

async function addMorphoInterestToFees(options: FetchOptions, dailyFees: any) {
    // Build marketId -> loanToken mapping from CreateMarket events
    const markets = await fetchMorphoMarketsOnHyperliquid(options);
    const marketIdToLoanToken: Record<string, string> = {};
    for (const m of markets) marketIdToLoanToken[String(m.marketId).toLowerCase()] = m.loanAsset;

    // Fetch AccrueInterest events for the day
    const accrueEvents = await options.getLogs({
        target: MORPHO_BLUE_HYPERLIQUID,
        eventAbi: MorphoBlueAbis.AccrueInterest,
    });

    for (const ev of accrueEvents) {
        const token = marketIdToLoanToken[String(ev.id).toLowerCase()];
        if (!token) continue;
        const interest = BigInt(ev.interest);
        if (interest === 0n) continue;
        dailyFees.add(token, interest, METRIC.BORROW_INTEREST);
    }
}
const getTotalSupply = async (options, target) => {
    return await options.api.call({
        target: target,
        abi: "function totalSupply() external view returns (uint256)",
    });
};



const exchangeRateMidasAbi = "function lastAnswer() external view returns (int256)";
const exchangeRateUpshiftAbi = "function latestAnswer() external view returns (int256)";
const getExchangeRateBeforeAfterVaults = async (options, target, abi) => {
    const [exchangeRateBefore, exchangeRateAfter] = await Promise.all([
        options.fromApi.call({
            target: target,
            abi: abi,
            params: [],
        }),
        options.toApi.call({
            target: target,
            abi: abi,
            params: [],
        })])

    return [exchangeRateBefore, exchangeRateAfter]

}


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();


    // be hype vault
    const totalSupply_behype = await getTotalSupply(options, BEHYPE);
    const [exchangeRateBeforeBEHYPE, exchangeRateAfterBEHYPE] = await getExchangeRateBeforeAfterVaults(options, BEHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_behype / 1e18) * (exchangeRateAfterBEHYPE / 1e8 - exchangeRateBeforeBEHYPE / 1e8));
    // // hbusdt vault
    const totalSupply_hbusdt = await getTotalSupply(options, HBUSDT);
    const [exchangeRateBeforeHBUSDT, exchangeRateAfterHBUSDT] = await getExchangeRateBeforeAfterVaults(options, HBUSDT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usdt0', (totalSupply_hbusdt / 1e18) * (exchangeRateAfterHBUSDT / 1e8 - exchangeRateBeforeHBUSDT / 1e8));
    // // hbxaut vault
    const totalSupply_hbxaut = await getTotalSupply(options, HBXAUT);
    const [exchangeRateBeforeHBXAUT, exchangeRateAfterHBXAUT] = await getExchangeRateBeforeAfterVaults(options, HBXAUT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('xaut', (totalSupply_hbxaut / 1e18) * (exchangeRateAfterHBXAUT / 1e8 - exchangeRateBeforeHBXAUT / 1e8));
    // //hblsthype vault
    const totalSupply_hblsthype = await getTotalSupply(options, HBLSTHYPE);
    const [exchangeRateBeforeHBLSTHYPE, exchangeRateAfterHBLSTHYPE] = await getExchangeRateBeforeAfterVaults(options, HBLSTHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('kinetic-staked-hype', (totalSupply_hblsthype / 1e18) * (exchangeRateAfterHBLSTHYPE / 1e8 - exchangeRateBeforeHBLSTHYPE / 1e8));
    // //hbhype vault
    const totalSupply_hbhype = await getTotalSupply(options, HBHYPE);
    const [exchangeRateBeforeHBHYPE, exchangeRateAfterHBHYPE] = await getExchangeRateBeforeAfterVaults(options, HBHYPE_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_hbhype / 1e18) * (exchangeRateAfterHBHYPE / 1e8 - exchangeRateBeforeHBHYPE / 1e8));
    // // hbbtc vault
    const totalSupply_hbbtc = await getTotalSupply(options, hbBTC);
    const [exchangeRateBeforeHBTC, exchangeRateAfterHBTC] = await getExchangeRateBeforeAfterVaults(options, hbBTC_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
    dailyFees.addCGToken('unit-bitcoin', (totalSupply_hbbtc / 1e18) * (exchangeRateAfterHBTC / 1e8 - exchangeRateBeforeHBTC / 1e8));

    // Add Morpho Blue borrow interest (Hyperliquid)
    await addMorphoInterestToFees(options, dailyFees);
    return {
        dailyFees,

    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            meta: {
                methodology: {
                    Fees: "Fees generated by vaults",
                    Revenue: "Staking/Restaking rewards + Fees on Liquid Vaults",
                },
            },
            start: '2025-05-01',
        },
    },
};

export default adapter;