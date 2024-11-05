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

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens, getSolanaReceived } from '../helpers/token';

const tokens = {
    ethereum: [
        "0xfb7b4564402e5500db5bb6d63ae671302777c75a", // DEXT
    ],
    bsc: [
        "0xe91a8d2c584ca93c7405f15c22cdfe53c29896e3", // DEXT
    ],
    base: []
} as any

const sol = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({ options, target: 'GZ7GGigCJF5AUDky2kts5GAsHwdfkzuFXochCQy3cxfW' })
    return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.BSC].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: evmReceivedGasAndTokens('0x997Cc123cF292F46E55E6E63e806CD77714DB70f', tokens[chain]),
                    }
    }), {
        [CHAIN.SOLANA]: {
            fetch: sol,
            start: 0
        }
    })
    // missing tron and ton
}

export default adapter;