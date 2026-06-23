import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from '../../helpers/coreAssets.json';

const BUYBACK_TO_BURN_END_DATE = '2026-02-02';
const BUYBACK_TO_STAKERS_START_DATE = '2026-06-17';

// https://docs.asterdex.com/usdaster-token/tokenomics
const buybackWalletToBurn = '0x5E4969C41ca9F9831468B98328A370b7AbD5a397';
const buybackWalletToStakers = '0xa0edBaBcb48034e368de286b49F9603C7AfA1b60';
const twapContract = '0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994';
const asterToken = '0x000ae314e2a2172a039b26378814c252734f556a';
const listingFeeRecipient = '0x39C473f4420e4ae9Ab3fe9e7ceDFc08F9684bB1a';

async function fetch(options: FetchOptions) {

    let rev;
    if (options.dateString <= BUYBACK_TO_BURN_END_DATE) {
        rev = await addTokensReceived({
            options,
            target: buybackWalletToBurn,
            fromAddressFilter: twapContract,
            token: asterToken,
        });
    } else if (options.dateString < BUYBACK_TO_STAKERS_START_DATE) {
        rev = options.createBalances();
    } else {
        rev = await addTokensReceived({
            options,
            target: buybackWalletToStakers,
            token: asterToken,
        });
    }

    const listingFeeRevenue = await addTokensReceived({
        options,
        target: listingFeeRecipient,
        token: ADDRESSES.bsc.USDT
    });

    const dailyHoldersRevenue = rev.clone(1, METRIC.TOKEN_BUY_BACK);
    const dailyFees = listingFeeRevenue.clone(1, "Listing Fees");

    return {
        dailyFees,
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "USDT listing fees (50K per listing) from permissionless token listings on Aster Spot, directed to ASTER stakers.",
    HoldersRevenue: "Aster token strategic buybacks from platform fees. (Used to be burnt before Feb 2nd, 2026, now directed to ASTER stakers)"
}

const breakdownMethodology = {
    Fees: {
      "Listing Fees": "USDT listing fees (50K per listing) from permissionless token listings on Aster Spot, directed to ASTER stakers.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "Aster tokens purchased by the protocol treasury through TWAP contract for strategic buybacks, funded by accumulated platform fees. (Used to be burnt before Feb 2nd, 2026, now directed to ASTER stakers)",
    }
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BSC],
    start: '2026-01-19',
    methodology,
    breakdownMethodology,
}

export default adapter;
