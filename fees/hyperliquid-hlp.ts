import adapters from './hyperliquid'
const { breakdown, ...rest } = adapters

const methodology = {
    Fees: "1% of the hyperliquid spot and perp fees goes to HLP liquidity providers, before 30 Aug 2025 it was 3%",
    SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3%",
}

export default {
    ...rest,
    methodology,
    adapter: breakdown["hlp"],
}