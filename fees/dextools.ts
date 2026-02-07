/*
Payment Transaction Link (etherscan,bscscan...)
*
Fast Track Update Fee (for tokens deployed on all chains):

The fee for a fast track update can be paid using either 1500 $DEXT, 0.4 $ETH, or 2 $BNB.
Please make the payment exclusively to this address: 0x997Cc123cF292F46E55E6E63e806CD77714DB70f
Submit the form immediately after payment to avoid losing its validity.
Fast Track Update Fee ONLY for tokens deployed on Solana:

The discounted fee for a fast track update can be paid using 5 $SOL.
Please make the payment exclusively to this address: GZ7GGigCJF5AUDky2kts5GAsHwdfkzuFXochCQy3cxfW

Ensure all information in the form is accurate before submitting, we do not issue refunds. Do NOT send from an exchange. For a smoother update, it is advised to send funds from the token's deployer.

Correct: https://etherscan.io/tx/0x123....
Not correct: 0x123....

🔥 🔥 🔥 Get 50% discount on your update for tokens deployed on BASE Blockchain for a limited time:
The fee for a fast track update on BASE can be paid using either 750 $DEXT, 0.2 $ETH, or 1 $BNB.
Please make the payment exclusively to this address: 0x997Cc123cF292F46E55E6E63e806CD77714DB70f
Submit the form immediately after payment to avoid losing its validity.

🔥 🔥 🔥 Get 70% discount on your update for tokens deployed on TON and TRON Blockchain for a limited time:
The fee for a fast track update on TON can be paid using 60 $TON, 0.12 $ETH, 450 $DEXT, or 0.6 $BNB.
Please make the payment exclusively to this address (ERC20 payments to the ERC20 address above):
UQC2-PvRTlqkHfeUdDx80rVRnaW7WoNWlpq4LBx7oWVhKisC

Submit the form immediately after payment to avoid losing its validity.
The discount is valid only if applied at payment and while it is displayed in the form; no refunds for overpayments or unused discounts!

For Tokens created with https://creator.dextools.io, enter "//TOKENCREATOR//" as the payment code. Entering the token creator's payment code without creating the token through the creator will mark your update request as spam.
*/

import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived, getETHReceived, getSolanaReceived } from '../helpers/token';

const tokens = {
    ethereum: [
        "0xfb7b4564402e5500db5bb6d63ae671302777c75a", // DEXT
        ADDRESSES.ethereum.USDC,
        ADDRESSES.ethereum.USDT,
    ],
    bsc: [
        "0xe91a8d2c584ca93c7405f15c22cdfe53c29896e3", // DEXT
    ],
    base: []
} as any;

const DEXT = "0xfb7b4564402e5500db5bb6d63ae671302777c75a";

const target_even: any = {
    [CHAIN.ETHEREUM]: [
        '0x4f62c60468A8F4291fec23701A73a325b2540765',
        '0x501424D3F63F30c119cBAE88de531c80D8a93f6B',
        '0x96c195F6643A3D797cb90cb6BA0Ae2776D51b5F3',
        '0xDeb2FD0a2870Df5eBDC1462E1725B0a30FbB49A3'
    ],
    [CHAIN.BSC]: ['0x997Cc123cF292F46E55E6E63e806CD77714DB70f'],
    [CHAIN.BASE]: ['0x997Cc123cF292F46E55E6E63e806CD77714DB70f'],
}

const sol = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({
        options, targets: [
            '4sdKYA9NLD1XHThXGPTmFE973mNs1UeVkCH4dFL3Wgho',
            'e24SXSTq1AkusXQEKgZW389taxTTzSuGF8JQqjhbTfc',
            'Hz77efVEvgUHUN55WAY97BiEEFg3DbgYBiCNo4UrQx9r'
        ]
    })
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }
}

const fetchEvm = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    if (tokens[options.chain].length > 0) {
        await addTokensReceived({ options, tokens: tokens[options.chain], targets: target_even[options.chain], balances: dailyFees })
    }
    const dailyHoldersRevenue = options.createBalances();
    if (options.chain === CHAIN.ETHEREUM)
        await addTokensReceived({ options, token: DEXT, targets: target_even[options.chain], balances: dailyHoldersRevenue })
    await getETHReceived({ options, balances: dailyFees, targets: target_even[options.chain] })
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue }
}

const methodology = {
    Fees: 'All fees paid by users for token profile listing.',
    Revenue: 'All fees collected by DexTools.',
    ProtocolRevenue: 'All fees collected by DexTools.',
    HoldersRevenue: 'All the social update fees paid in DEXT are burnt',
}

const adapter: Adapter = {
    methodology,
    version: 1,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
    adapter: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.BSC].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: fetchEvm,
        }
    }), {
        [CHAIN.SOLANA]: {
            fetch: sol,
        }
    })
    // missing tron and ton
}

export default adapter;
