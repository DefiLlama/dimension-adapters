import { zeroPadValue } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://gold.tether.to/legal/feeschedule - 0.25% on XAUT purchased from or redeemed with Tether
const FEE_RATE = 0.0025

const xaut = '0x68749665FF8D2d112Fa859AA293F07A622782F38'

const TETHER_TREASURY = '0x5754284f345afc66a98fbb0a0afe71e0f007b949'

const NON_SALE_RECIPIENTS = new Set([
    '0xc6cde7c39eb2f0f0095f41570af89efc2c1ea828', // XAUT owner contract
    '0xb9c2321bb7d0db468f570d10a424d1cc8efd696c', // LayerZero OFT adapter for XAUT0
])

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const TRANSFER_EVENT = 'event Transfer (address indexed from, address indexed to, uint256 value)'
const REDEEM_EVENT = 'event Redeem (uint256 _amount)'

const PURCHASE_FEES = 'Purchase Fees'
const REDEMPTION_FEES = 'Redemption Fees'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const [treasuryTransfers, redeemLogs] = await Promise.all([
        options.getLogs({
            eventAbi: TRANSFER_EVENT,
            target: xaut,
            topics: [TRANSFER_TOPIC, zeroPadValue(TETHER_TREASURY, 32)],
        }),
        options.getLogs({
            eventAbi: REDEEM_EVENT,
            target: xaut
        })
    ])
    treasuryTransfers
        .filter((log) => !NON_SALE_RECIPIENTS.has(log.to.toLowerCase()))
        .forEach((log) => dailyFees.add(xaut, Number(log.value) * FEE_RATE, PURCHASE_FEES));
    redeemLogs.forEach((log) => dailyFees.add(xaut, Number(log._amount) * FEE_RATE, REDEMPTION_FEES));
    return {
        dailyFees,
        dailyRevenue: dailyFees.clone(),
        dailyProtocolRevenue: dailyFees.clone(),
        dailyUserFees: dailyFees.clone(),
    }
}
const adapters : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2021-10-31',
    methodology: {
        Fees: "0.25% fee on XAUT bought from Tether (delivered from the Tether treasury) and on XAUT redeemed and burned by Tether. Newly minted XAUT that is still unsold in the treasury, and treasury transfers to the XAUT0 bridge, are not counted.",
        Revenue: "All XAUT purchase and redemption fees, kept by Tether.",
        ProtocolRevenue: "All XAUT purchase and redemption fees, kept by Tether.",
        UserFees: "0.25% fee paid by users buying XAUT from or redeeming XAUT with Tether.",
    },
    breakdownMethodology: {
        Fees: {
            [PURCHASE_FEES]: "0.25% of the XAUT delivered from the Tether treasury to buyers.",
            [REDEMPTION_FEES]: "0.25% of the XAUT redeemed and burned by Tether.",
        },
        Revenue: {
            [PURCHASE_FEES]: "0.25% of the XAUT delivered from the Tether treasury to buyers, kept by Tether.",
            [REDEMPTION_FEES]: "0.25% of the XAUT redeemed and burned by Tether, kept by Tether.",
        },
        ProtocolRevenue: {
            [PURCHASE_FEES]: "0.25% of the XAUT delivered from the Tether treasury to buyers, kept by Tether.",
            [REDEMPTION_FEES]: "0.25% of the XAUT redeemed and burned by Tether, kept by Tether.",
        },
        UserFees: {
            [PURCHASE_FEES]: "0.25% of the XAUT bought from the Tether treasury.",
            [REDEMPTION_FEES]: "0.25% of the XAUT redeemed with Tether.",
        },
    },
};
export default adapters;
