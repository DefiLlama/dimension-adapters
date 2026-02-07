import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const EVENT_ABI = {
    MARKED: "event Marked (uint8 type, uint256 amount, uint256 fees)",
    STANDARD_REDEMPTION: "event RedeemFinalized (address indexed user, uint256 assets, uint256 fee)",
    FASTLANE_REDEMPTION: "event Redeemed (address indexed user, uint256 shares, uint256 assets, uint256 fee)"
};

const BUY_BACK_ADDRESS = '0xcbcc15e2f566fdb46e93d925efcbf0ccc5378d3b';
const BUY_BACK_TOKEN = '0x77146784315ba81904d654466968e3a7c196d1f3';

const ADDRESSES: any = {
    [CHAIN.ETHEREUM]: {
        accounting: "0xb7Ce3cb5Bc5c00cd2f9B39d9b0580f5355535709",
        token: "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8", //tEth
        redemption: "0xcd63a29FAfF07130d3Af89bB4f40778938AaBB85",
        fastlaneRedemption: "0x829525417Cd78CBa0f99A8736426fC299506C0d6",
        stakedToken: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // Lido wstEth
        excludeWallets: [
          '0xf37856a029d87dbc53cf751c4864edab919b4702',
          '0x2aB1a0477504d243fD9801c94dB5181104BDa38A',
        ],
    },
    [CHAIN.AVAX]: {
        accounting: "0x6f5D00a263dE6d40B4b2342996D2682E34f8A454",
        token: "0x14a84f1a61ccd7d1be596a6cc11fe33a36bc1646", //tAvax
        redemption: "0x765f6dc8496ca7EF1e4a391bE10185229AACf04b",
        fastlaneRedemption: "0x3D00a639183B07e35EFEF044eE6cC14e8598A01c",
        stakedToken: "0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be", //benqi sAvax
        excludeWallets: [
          '0xf37856a029d87dbc53cf751c4864edab919b4702',
          '0x2aB1a0477504d243fD9801c94dB5181104BDa38A',
        ],
    }
};

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const { accounting, token, redemption, fastlaneRedemption, stakedToken } = ADDRESSES[options.chain]
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const markedLogs = await options.getLogs({ target: accounting, eventAbi: EVENT_ABI.MARKED, });
    const standardRedemptionLogs = await options.getLogs({ target: redemption, eventAbi: EVENT_ABI.STANDARD_REDEMPTION });
    const fastlaneRedemptionLogs = await options.getLogs({ target: fastlaneRedemption, eventAbi: EVENT_ABI.FASTLANE_REDEMPTION });
    

    markedLogs.forEach(log => {
        dailySupplySideRevenue.add(token, log.amount, METRIC.ASSETS_YIELDS);
        dailyProtocolRevenue.add(token, log.fees, METRIC.PERFORMANCE_FEES);
    });
    
    // no revenue on standard redemption
    standardRedemptionLogs.forEach(log => dailySupplySideRevenue.add(token, log.fee, METRIC.MINT_REDEEM_FEES));

    fastlaneRedemptionLogs
      .filter(log => !ADDRESSES[options.chain].excludeWallets.includes(String(log.user).toLowerCase()))
      .forEach(log => dailyProtocolRevenue.add(stakedToken, log.fee, METRIC.MINT_REDEEM_FEES));

    const dailyFees = dailySupplySideRevenue.clone();
    dailyFees.add(dailyProtocolRevenue);

    let buybackTree = options.createBalances();
    if (options.chain === CHAIN.ETHEREUM) {
      buybackTree = await addTokensReceived({ options, target: BUY_BACK_ADDRESS, token: BUY_BACK_TOKEN })
    }
  
    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.add(buybackTree, METRIC.TOKEN_BUY_BACK);
  
    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    };
}

const methodology = {
    Fees: "Includes Market Effective Yield(MEY) earned by treehouse assets and redemption fee",
    Revenue: "Standard Redemption(7 days waiting(tEth), 17 days waiting(tAvax)) fee of 0.05%, Fastlane redemption fee of 2%(tEth, tAvax), and 20% performance fee on MEY",
    ProtocolRevenue: "All the revenue goes to protocol treasury",
    HoldersRevenue: "Buy back TREE from protocol treasury",
    SupplySideRevenue: "MEY earned by treehouse asset holders post performance fee",
};

const breakdownMethodology = {
    Revenue: {
        [METRIC.MINT_REDEEM_FEES]: 'Fastlane redemption fees',
        [METRIC.PERFORMANCE_FEES]: '20% perfomance fees on MEY only when MEY is positive'
    },
    SupplySideRevenue: {
        [METRIC.MINT_REDEEM_FEES]: 'Standard redemption fees',
        [METRIC.ASSETS_YIELDS]: 'Market effective yields post performance fees',
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: 'Buy back TREE from protocol treasury',
    },
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    breakdownMethodology,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2024-09-10' },
        [CHAIN.AVAX]: { start: '2025-08-28' }
    }
};

export default adapter;