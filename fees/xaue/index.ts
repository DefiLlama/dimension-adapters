import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Protocol reference: https://xaue.com/xaue_protocol_info_en.v1.pdf
// The document describes XAUE value accrual through Oracle NAV growth and does not disclose protocol fee rates.
const ADDRESSES = {
    XAUE: "0xd5D6840ed95F58FAf537865DcA15D5f99195F87a",
    ORACLE: "0x0618BD112C396060d2b37B537b3d92e757644169",
    XAUT: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    XAUE_DECIMALS: 18n,
    XAUT_DECIMALS: 6n,
    PRICE_DECIMALS: 18n,
}

const ABIS = {
    totalSupply: "uint256:totalSupply",
    getLatestPrice: "uint256:getLatestPrice",
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const [priceStart, priceEnd, totalSupply] = await Promise.all([
        options.fromApi.call({ abi: ABIS.getLatestPrice, target: ADDRESSES.ORACLE }),
        options.toApi.call({ abi: ABIS.getLatestPrice, target: ADDRESSES.ORACLE }),
        options.fromApi.call({ abi: ABIS.totalSupply, target: ADDRESSES.XAUE }),
    ]);

    const priceDelta = BigInt(priceEnd) - BigInt(priceStart);

    const conversionScale = 10n ** (ADDRESSES.XAUE_DECIMALS + ADDRESSES.PRICE_DECIMALS - ADDRESSES.XAUT_DECIMALS);
    const yieldInAsset = (BigInt(totalSupply) * priceDelta) / conversionScale;
    dailyFees.add(ADDRESSES.XAUT, yieldInAsset, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(ADDRESSES.XAUT, yieldInAsset, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Yield accrued to XAUE holders from Oracle NAV growth. The Oracle computes NAV linearly from baseNetValue and currentAPR; daily yield is start-of-period XAUE supply multiplied by the NAV increase.",
    Revenue: "No protocol revenue or management/performance fee is disclosed in the protocol information document, so revenue is reported as zero.",
    ProtocolRevenue: "No protocol revenue or management/performance fee is disclosed in the protocol information document, so protocol revenue is reported as zero.",
    SupplySideRevenue: "Yield accrued to XAUE holders through XAUE NAV appreciation, denominated in XAUt.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yield generated from XAUE Oracle NAV appreciation.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yield distributed to XAUE holders through NAV appreciation.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.ETHEREUM],
    fetch,
    start: "2026-03-24", // first full UTC day after block 24718738, Mar-23-2026 07:30:59 AM UTC
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
};

export default adapter;
