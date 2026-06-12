import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Conflux eSpace uses CIP-1559: base fee is burned, priority fee goes to validators.
// Revenue = gasUsed × baseFeePerGas (burned portion).
// SupplySideRevenue = total fees - burned (validator tips).
// baseFeePerGas ≈ minGasPrice observed that day (confirmed equal at low utilisation via RPC).
const API_BASE = "https://evmapi.confluxscan.io/api";

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dateString = options.dateString;
    const prevDay = new Date(new Date(dateString).getTime() - 86400000).toISOString().slice(0, 10);

    const [feeData, gasUsedData, gasPriceData] = await Promise.all([
        fetchURL(`${API_BASE}?module=stats&action=dailytxnfee&startdate=${prevDay}&enddate=${dateString}`),
        fetchURL(`${API_BASE}?module=stats&action=dailygasused&startdate=${prevDay}&enddate=${dateString}`),
        fetchURL(`${API_BASE}?module=stats&action=dailyavggasprice&startdate=${prevDay}&enddate=${dateString}`),
    ]);

    if (!Array.isArray(feeData?.result) || !Array.isArray(gasUsedData?.result) || !Array.isArray(gasPriceData?.result))
        throw new Error(`Conflux: API error for ${dateString}`);

    const feeToday = feeData.result.find((e: any) => e.UTCDate === dateString);
    const gasUsedToday = gasUsedData.result.find((e: any) => e.UTCDate === dateString);
    const gasPriceToday = gasPriceData.result.find((e: any) => e.UTCDate === dateString);

    if (!feeToday || !gasUsedToday || !gasPriceToday) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

    const totalFeesCFX = Number(feeToday.transactionFee_CFX);
    // Base fee equals the minimum observed gas price (Drip). Burned = gasUsed × baseFee / 1e18.
    const burnedCFX = (Number(gasUsedToday.gasUsed) * Number(gasPriceToday.minGasPrice_Drip)) / 1e18;
    const validatorCFX = Math.max(0, totalFeesCFX - burnedCFX);

    dailyFees.addCGToken("conflux-token", totalFeesCFX, "Transaction Fees");
    dailyRevenue.addCGToken("conflux-token", burnedCFX, "Burned Base Fees");
    dailySupplySideRevenue.addCGToken("conflux-token", validatorCFX, "Validator Tips");

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.CONFLUX],
    start: "2022-02-20",
    protocolType: ProtocolType.CHAIN,
    methodology: {
        Fees: "Transaction fees paid by users on Conflux eSpace",
        Revenue: "Base fees burned via CIP-1559 (gasUsed × baseFeePerGas)",
        SupplySideRevenue: "Priority fees (tips) paid to validators",
    },
    breakdownMethodology: {
        Fees: {
            "Transaction Fees": "Total gas fees paid by users on Conflux eSpace",
        },
        Revenue: {
            "Burned Base Fees": "Base fee portion of gas fees burned by the protocol (CIP-1559)",
        },
        SupplySideRevenue: {
            "Validator Tips": "Priority fee portion of gas fees paid to block validators",
        },
    },
};

export default adapter;
