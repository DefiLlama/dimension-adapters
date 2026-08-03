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
        dailyRevenue: dailyHoldersRevenue,
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "USDT listing fees (50K per listing) from permissionless token listings on Aster Spot. Listing fees are collected weekly and enter the platform-fee buyback program.",
    Revenue: "Aster buybacks are treated as revenue. Buybacks were sent to the burn wallet through Feb 2, 2026; there was no tracked allocation from Feb 3 through Jun 16, 2026; from Jun 17, 2026, 99% of daily platform fees is used to buy back ASTER via TWAP for veASTER stakers.",
    HoldersRevenue: "ASTER buybacks directed to token holders: buybacks were sent to the burn wallet through Feb 2, 2026; from Jun 17, 2026, 99% of daily platform fees is used to buy back ASTER via TWAP and distributed to veASTER stakers. This adapter currently captures ASTER transfers into the published buyback wallet indexed on BSC; it does not infer the execution contract from the ERC-20 Transfer sender, and Aster Chain transfers are not included because the repository has no supported Aster Chain source."
}

const breakdownMethodology = {
    Fees: {
      "Listing Fees": "USDT listing fees (50K per listing) from permissionless token listings on Aster Spot. Listing fees are collected weekly and enter the platform-fee buyback program.",
    },
    Revenue: {
      [METRIC.TOKEN_BUY_BACK]: "ASTER buybacks: burn-wallet purchases through Feb 2, 2026, and 99% of daily platform fees bought back via TWAP for veASTER stakers from Jun 17, 2026.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "ASTER transfers into the published buyback wallet indexed on BSC: burn-wallet purchases through Feb 2, 2026, and the post-Jun 17, 2026 wallet settlement for the TWAP-funded veASTER buyback program. ERC-20 Transfer senders may be liquidity or processor contracts rather than the TWAP executor; Aster Chain transfers are out of scope.",
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
