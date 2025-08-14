import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from '../../helpers/token';
import { CHAIN } from "../../helpers/chains";
import { capConfig } from "./config";
import { fetchAssetAddresses, fetchVaultConfigs } from "./helpers";

const fetch = async (options: FetchOptions) => {
    const infra = capConfig[options.chain].infra;
    const tokens = capConfig[options.chain].tokens;

    const assetAddresses = await fetchAssetAddresses(options, options.chain);
    const vaultConfigs = await fetchVaultConfigs(options);

    const senders = [tokens.cUSD.address, tokens.stcUSD.address, infra.lender.address, infra.delegation.address];
    const watchedTokens = [tokens.cUSD.address, tokens.stcUSD.address, ...assetAddresses];

    const borrowFees = await addTokensReceived({
        options,
        fromAdddesses: senders,
        tokens: watchedTokens,
        targets: vaultConfigs.map(i => i.interestReceivers).flat()
    })

    const restakerFees = await addTokensReceived({
        options,
        fromAdddesses: senders,
        tokens: watchedTokens,
        target: infra.delegation.address,
    })

    const insuranceFunds = vaultConfigs.map(i => i.insuranceFund).filter(i => i !== null);
    const insuranceFundFees = insuranceFunds.length > 0
        ? await addTokensReceived({
            options,
            fromAdddesses: senders,
            tokens: watchedTokens,
            targets: insuranceFunds,
        })
        : options.createBalances();

    const dailyFees = options.createBalances();
    dailyFees.addBalances(borrowFees);
    dailyFees.addBalances(restakerFees);
    dailyFees.addBalances(insuranceFundFees);

    // no revenue for now
    const dailyRevenue = options.createBalances();

    const dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addBalances(borrowFees);
    dailySupplySideRevenue.addBalances(restakerFees);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
    }
};

const methodology = {
    Fees: 'All fees paid by users for either borrowing (borrow fees + restaker fees) or minting (insurance fund fees).',
    Revenue: 'Revenue is not collected yet.',
    SupplySideRevenue: 'Borrow fees distributed to stakers and restaker fees are distributed to delegators.',
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: capConfig[CHAIN.ETHEREUM].fromDate,
    methodology
}

export default adapter;