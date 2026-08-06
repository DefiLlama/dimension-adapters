import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

export const FEE_EVENT = "event FeeCollected(address indexed partner, address indexed token, uint256 amount, uint256 fee)";
export const OMNIPOOL_FEE_EVENT = "event FeeCollected(address token, uint256 amount, uint256 fee)";

// stableBridgingFee, deducted on the destination leg of every cross chain transfer and paid to
// the bridge, which only the owner/admin can withdraw from
export const BURN_COMPLETED_EVENT = "event BurnCompleted(bytes32 indexed id, bytes32 indexed crossChainID, address indexed to, uint256 amount, uint256 bridgingFee, address token)";
export const REVERT_SYNTHESIZE_EVENT = "event RevertSynthesizeCompleted(bytes32 indexed id, address indexed to, uint256 amount, uint256 bridgingFee, address token)";
export const SYNTHESIZE_COMPLETED_EVENT = "event SynthesizeCompleted(bytes32 indexed id, address indexed to, bytes32 indexed crossChainID, uint256 amount, uint256 bridgingFee, address token)";
export const REVERT_BURN_COMPLETED_EVENT = "event RevertBurnCompleted(bytes32 indexed id, address indexed to, uint256 amount, uint256 bridgingFee, address token)";

export const SIS_SYNTHESIS = "0x45CFd6FB7999328F189aaD2739Fba4Be6C45E5bf";

// deploy dates on the symbiosis chain, found by binary searching eth_getCode. the partner fee
// collector there is older than both, so the chain is queried from its start and these two sources
// are skipped until they exist
export const SIS_SYNTHESIS_START = "2025-07-07";
export const OCTOPOOL_START = "2025-07-10";

export const SYMBIOSIS_CHAIN_ID = 13863860;
export const TOKENS_API = "https://api.symbiosis.finance/crosschain/v2/tokens";

// octopools (omnipool), all live on the symbiosis chain
export const OCTOPOOLS = [
    "0xC3255E317481B95A3e61844c274dE8BAF8eDF397", // USD
    "0x2d877Fe148dBCB056Bf71ED5232E8d580195c0f1", // ETH
    "0xBf084Ee3E5C73129167167Bd5DB9FE8513d8F7e0", // BTC
    "0x20C54Cc697329333fe00DeD49C7dCA8c83dcE65b", // G
    "0x095B362957B3E3638AE1eb7A957f392cD3Dc3c7C", // WBNB
    "0x3E6A3EbbC9D88ACC192221797ad90BF72d391778", // SIS
    "0x0b01139C59D6bc2C8323FDbb4824e4aa5Ff4DE7C", // APE
    "0xd40750043100501ea75cAc2386f23Bcf7554cB9A", // EVAA
    "0x8dce34d21b3AAFEBE9BBd37bf2db32BD846Cee09", // DROPEE
];

export const LP_DIVIDEND_RATIO_ABI = "uint256:lpDividendRatio";

// partner_fee_collector is only deployed on a handful of chains, portal is the bridge side and is on
// every chain that locks real tokens. start is the earliest of the two, partner_fee_start holds back
// the collector on chains where the portal came first
export const chainConfig: Record<string, { partner_fee_collector?: string; start: string , default_fee_addr?: string, portal?: string, partner_fee_start?: string }> = {
    [CHAIN.SIS]: {
        partner_fee_collector: "0x783EE304C54d4658f59EAefb73b32D37ee466e23",
        start: "2024-01-13",
    },
    [CHAIN.ETHEREUM]: {
        partner_fee_collector: "0xb4291B5F2ed122d306afEf72a2B0127613aB1EEf",
        start: "2022-03-30",
        partner_fee_start: "2026-05-04",
        default_fee_addr: "0x5112EbA9bc2468Bb5134CBfbEAb9334EdaE7106a",
        portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8",
    },
    [CHAIN.BSC]: {
        partner_fee_collector: "0xc6a2C8D42086B13A577e1c300663451Ae405b767",
        start: "2022-03-30",
        partner_fee_start: "2024-03-24",
        default_fee_addr: "0x60b9be4FE2bd7b012A3bF64bdD49c907F54276EA",
        portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4",
    },
    [CHAIN.CITREA]: {
        partner_fee_collector: "0xca506793A420E901BbCa8066be5661E3C52c84c2",
        start: "2026-05-04",
        default_fee_addr: "0x74c2FF71FefB9aEAe25453B148784c39f286E8D4",
    },
    // rootstock public rpcs do not serve eth_getLogs
    // [CHAIN.ROOTSTOCK]: {
    //     partner_fee_collector: "0xbba322c98601B707cFfb98092010E0b95d538BB7",
    //     start: "2024-02-14",
    //     default_fee_addr: "0xa1b4778126801acbC39405B917dB411c73912E28",
    //     portal: "0x5aa5f7f84ed0e5db0a4a85c3947ea16b53352fd4",
    // },
    // bridge only chains, start is the day symbiosis first reported tvl on them
    [CHAIN.AVAX]: { start: "2022-03-30", portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" },
    [CHAIN.POLYGON]: { start: "2022-03-30", portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8" },
    [CHAIN.BOBA]: { start: "2022-04-04", portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8" },
    [CHAIN.TELOS]: { start: "2022-08-20", portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8" },
    [CHAIN.KAVA]: { start: "2023-02-15", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.ERA]: { start: "2023-04-11", portal: "0x4f5456d4d0764473DfCA1ffBB8524C151c4F19b9" },
    [CHAIN.ARBITRUM]: { start: "2023-04-20", portal: "0x01A3c8E513B758EBB011F7AFaf6C37616c9C24d9" },
    [CHAIN.OPTIMISM]: { start: "2023-05-02", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.ARBITRUM_NOVA]: { start: "2023-05-24", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.POLYGON_ZKEVM]: { start: "2023-05-31", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.LINEA]: { start: "2023-07-20", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.MANTLE]: { start: "2023-07-20", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.BASE]: { start: "2023-08-09", portal: "0xEE981B2459331AD268cc63CE6167b446AF4161f8" },
    [CHAIN.SCROLL]: { start: "2023-10-19", portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" },
    [CHAIN.MANTA]: { start: "2023-11-03", portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" },
    [CHAIN.METIS]: { start: "2023-12-05", portal: "0xd8db4fb1fEf63045A443202d506Bcf30ef404160" },
    [CHAIN.MODE]: { start: "2024-02-07", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.BLAST]: { start: "2024-03-02", portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" },
    [CHAIN.MERLIN]: { start: "2024-03-12", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.ZKLINK]: { start: "2024-03-19", portal: "0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189" },
    [CHAIN.BAHAMUT]: { start: "2024-03-22", portal: "0x318C2B9a03C37702742C3d40C72e4056e430135A" },
    [CHAIN.CORE]: { start: "2024-05-01", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.TAIKO]: { start: "2024-05-30", portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" },
    // sei is disabled repo wide in runAdapter, getLogs times out there
    // [CHAIN.SEI]: { start: "2024-05-31", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.ZETA]: { start: "2024-06-09", portal: "0x8a7F930003BedD63A1ebD99C5917FD6aE7E3dedf" },
    [CHAIN.CRONOS]: { start: "2024-06-18", portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" },
    [CHAIN.FRAXTAL]: { start: "2024-06-26", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.GRAVITY]: { start: "2024-10-06", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.BSQUARED]: { start: "2024-11-09", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.CRONOS_ZKEVM]: { start: "2024-11-15", portal: "0x2E818E50b913457015E1277B43E469b63AC5D3d7" },
    [CHAIN.SONIC]: { start: "2025-01-26", portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" },
    [CHAIN.ABSTRACT]: { start: "2025-01-29", portal: "0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189" },
    [CHAIN.XDAI]: { start: "2025-02-01", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.BERACHAIN]: { start: "2025-02-07", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.MORPH]: { start: "2025-02-08", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.UNICHAIN]: { start: "2025-02-22", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.GOAT]: { start: "2025-04-10", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.SONEIUM]: { start: "2025-04-10", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.OP_BNB]: { start: "2025-05-15", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.HYPERLIQUID]: { start: "2025-06-03", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.KATANA]: { start: "2025-08-15", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.APECHAIN]: { start: "2025-10-02", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.PLASMA]: { start: "2025-10-02", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.MONAD]: { start: "2026-02-24", portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" },
    [CHAIN.TEMPO]: { start: "2026-04-15", portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" },
    [CHAIN.QUAI]: { start: "2026-07-15", portal: "0x003d9F9666853fD4A10351FF5364c602470A7cF6" },
}

// the symbiosis token api only reports a spot price, which misprices any backfilled day, so tokens
// are handed to llama by coingecko id where the symbol is known. the ids symbiosis itself declares
// for its octopools are used, the rest are the usual stable/eth/btc wrappers
const SYMBOL_CG_IDS: Record<string, string> = {
    USDC: "usd-coin", "USDC.e": "usd-coin", "USDC.n": "usd-coin", "USDC.ETH": "usd-coin", USDbC: "usd-coin",
    USDT: "tether", USDt: "tether", USDT0: "tether", "USD₮0": "tether", rUSDT: "tether",
    BUSD: "binance-usd", DAI: "dai",
    ETH: "ethereum", WETH: "ethereum", UETH: "ethereum",
    WBTC: "bitcoin", BTCB: "bitcoin", WRBTC: "bitcoin", coreBTC: "bitcoin", syBTC: "bitcoin",
    WBNB: "binancecoin",
    SIS: "symbiosis-finance", WSIS: "symbiosis-finance",
    APE: "apecoin", WAPE: "apecoin",
    G: "g-token", wG: "g-token",
    EVAA: "evaa-protocol", DROPEE: "dropee", METIS: "metis-token",
    QUAI: "quai-network", WQUAI: "quai-network",
}

// cgId is missing for tokens with no known coingecko id, those fall back to the api spot price
export type SisToken = { priceUsd: number, decimals: number, cgId?: string }

// sisTokens is keyed by the synth address on the symbiosis chain, realTokens by the token on its
// own chain, which is what the synthesis contract reports the mint leg fee in
export type SisTokens = { sisTokens: Record<string, SisToken>, realTokens: Record<string, SisToken> }

// fees on the symbiosis chain are taken in synthetic tokens that the llama coins api has no
// price for, so they are valued by coingecko id, falling back to the price symbiosis reports
export const getSisTokens = async (): Promise<SisTokens> => {
    const tokens = await fetchURL(TOKENS_API);
    const sisTokens: Record<string, SisToken> = {};
    const realTokens: Record<string, SisToken> = {};

    // an address is not unique across chains (0x42..06 is WETH on the op stack chains but WBTC on
    // bsquared) and the mint leg does not report which chain, so the lowest chain id wins
    const sorted = [...tokens].sort((a: any, b: any) => a.chainId - b.chainId);

    for (const token of sorted) {
        if (!token.address || !token.priceUsd) continue;

        const address = token.address.toLowerCase();

        // synths are named after the token they mirror, sUSDC is USDC and is worth the same
        let cgId = SYMBOL_CG_IDS[token.symbol];
        if (!cgId) cgId = SYMBOL_CG_IDS[token.symbol.replace(/^s/, "")];

        const priced = { priceUsd: token.priceUsd, decimals: token.decimals, cgId };

        if (token.chainId === SYMBIOSIS_CHAIN_ID) sisTokens[address] = priced;
        else if (!realTokens[address]) realTokens[address] = priced;
    }

    if (!Object.keys(sisTokens).length) throw new Error("symbiosis token api returned no priced tokens");

    return { sisTokens, realTokens };
}
