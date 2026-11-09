import ADDRESSES from '../../helpers/coreAssets.json'
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
const NET_TREASURY_FEES = 'Treehouse Fees To Treasury';

const config: any = {
    [CHAIN.ETHEREUM]: {
        accounting: "0xb7Ce3cb5Bc5c00cd2f9B39d9b0580f5355535709",
        token: "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8", //tEth
        redemption: "0xcd63a29FAfF07130d3Af89bB4f40778938AaBB85",
        fastlaneRedemption: "0x829525417Cd78CBa0f99A8736426fC299506C0d6",
        stakedToken: ADDRESSES.ethereum.WSTETH, // Lido wstEth
        excludeWallets: [
          '0xf37856a029d87dbc53cf751c4864edab919b4702',
          '0x2ab1a0477504d243fd9801c94db5181104bda38a',
          '0x7ca0192f401712a663e824a3a5220f5fb9e26855',
          '0x50f965cf0e9c6f14370cd99482451b6e5db5be3f',
        ],
    },
    [CHAIN.AVAX]: {
        accounting: "0x6f5D00a263dE6d40B4b2342996D2682E34f8A454",
        token: "0x14a84f1a61ccd7d1be596a6cc11fe33a36bc1646", //tAvax
        redemption: "0x765f6dc8496ca7EF1e4a391bE10185229AACf04b",
        fastlaneRedemption: "0x3D00a639183B07e35EFEF044eE6cC14e8598A01c",
        stakedToken: ADDRESSES.avax.SAVAX, //benqi sAvax
        excludeWallets: [
          '0xf37856a029d87dbc53cf751c4864edab919b4702',
          '0x2ab1a0477504d243fd9801c94db5181104bda38a',
          '0x8c2240ac1923bf96d991229c406c2edfc7b72aad',
        ],
    }
};

async function fetch(options: FetchOptions) {
    const { accounting, token, redemption, fastlaneRedemption, stakedToken } = config[options.chain]
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const markedLogs = await options.getLogs({ target: accounting, eventAbi: EVENT_ABI.MARKED, });
    const standardRedemptionLogs = await options.getLogs({ target: redemption, eventAbi: EVENT_ABI.STANDARD_REDEMPTION });
    const fastlaneRedemptionLogs = await options.getLogs({ target: fastlaneRedemption, eventAbi: EVENT_ABI.FASTLANE_REDEMPTION });


    markedLogs.forEach(log => {
        // type 0 marks a loss: the tAsset's totalAssets drops by `amount` and no performance fee is taken
        if (Number(log.type) === 0) return dailySupplySideRevenue.subtractToken(token, log.amount, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(token, log.amount, METRIC.ASSETS_YIELDS);
        dailyRevenue.add(token, log.fees, METRIC.PERFORMANCE_FEES);
    });

    // no revenue on standard redemption
    standardRedemptionLogs.forEach(log => dailySupplySideRevenue.add(token, log.fee, METRIC.MINT_REDEEM_FEES));

    fastlaneRedemptionLogs
      .filter(log => !config[options.chain].excludeWallets.includes(String(log.user).toLowerCase()))
      .forEach(log => dailyRevenue.add(stakedToken, log.fee, METRIC.MINT_REDEEM_FEES));

    const dailyFees = dailySupplySideRevenue.clone();
    dailyFees.add(dailyRevenue);

    let buybackTree = options.createBalances();
    if (options.chain === CHAIN.ETHEREUM) {
      buybackTree = await addTokensReceived({ options, target: BUY_BACK_ADDRESS, token: BUY_BACK_TOKEN })
    }
  
    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.add(buybackTree, METRIC.TOKEN_BUY_BACK);

    // Buybacks are paid out of the treasury, so protocol revenue is what the treasury keeps after them
    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addBalances(dailyRevenue, NET_TREASURY_FEES);
    dailyProtocolRevenue.subtract(dailyHoldersRevenue, NET_TREASURY_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    };
}

// rates: https://docs.treehouse.finance/protocol/tasset/architecture/fees
// fastlane fee cut from 2% to 0.5%: https://governance.treehouse.finance/t/tip-7-teth-redemption-parameter-adjustments/27
const methodology = {
    Fees: "Market Effective Yield (MEY) earned by tETH and tAVAX before the performance fee, net of MEY losses, plus standard and Fastlane redemption fees.",
    Revenue: "20% performance fee on positive MEY plus Fastlane instant-redemption fees (0.5% since TIP 7 in March 2026, 2% before), excluding Fastlane redemptions by a fixed list of excluded wallets.",
    ProtocolRevenue: "Revenue kept by the Treehouse treasury after the TREE buybacks it pays for.",
    HoldersRevenue: "TREE bought back by the protocol, counted as TREE received by the buyback wallet on Ethereum.",
    SupplySideRevenue: "MEY kept by tETH and tAVAX holders after the performance fee and net of MEY losses, plus standard (queued) redemption fees, which stay with holders rather than going to the treasury.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'MEY earned by tETH and tAVAX after the performance fee, net of MEY losses',
        [METRIC.PERFORMANCE_FEES]: '20% performance fee on MEY, charged only when MEY is positive',
        [METRIC.MINT_REDEEM_FEES]: 'Standard and Fastlane redemption fees',
    },
    Revenue: {
        [METRIC.MINT_REDEEM_FEES]: 'Fastlane redemption fees',
        [METRIC.PERFORMANCE_FEES]: '20% performance fee on MEY, charged only when MEY is positive'
    },
    ProtocolRevenue: {
        [NET_TREASURY_FEES]: 'Performance fees and Fastlane redemption fees kept by the treasury after TREE buybacks (negative on buyback days)',
    },
    SupplySideRevenue: {
        [METRIC.MINT_REDEEM_FEES]: 'Standard redemption fees',
        [METRIC.ASSETS_YIELDS]: 'Market effective yields post performance fees, net of MEY losses',
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: 'Buy back TREE from protocol treasury',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    // protocol revenue nets out weekly TREE buybacks (~$2.5k-5k, while revenue is often under $300/day since March 2026),
    // and MEY losses (type 0 Marked events) make yields negative in the hours they are marked
    allowNegativeValue: true,
    fetch,
    methodology,
    breakdownMethodology,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2024-09-10' },
        [CHAIN.AVAX]: { start: '2025-08-28' }
    }
};

export default adapter;