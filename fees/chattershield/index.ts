import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'

const FEE_RECEIVER_MULTISIG = "0xEF5EAB85EDCb1Cad33491C1f576Dd356dB7d63b9";
const SHIELD_TOKEN = "0xd8B90D2e680ea535eAcCe1b025c998B347892f68";
const HOLDERS_SHARE_MULIPLE = 0.4;

const fetch: any = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({
        tokens: [ADDRESSES.ethereum.USDC, SHIELD_TOKEN],
        target: FEE_RECEIVER_MULTISIG,
        options,
    })

    await getETHReceived({
        target: FEE_RECEIVER_MULTISIG,
        balances: dailyFees,
        options,
    });

    const dailyHoldersRevenue = dailyFees.clone(HOLDERS_SHARE_MULIPLE);
    const dailyProtocolRevenue = dailyFees.clone();
    dailyProtocolRevenue.subtract(dailyHoldersRevenue);

    return {
        dailyFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
    }
}

const methodology = {
    Fees: "Fees paid for bounties,ad-space,custom graphics and engagements on twitter",
    Revenue: "All the fees are revenue(goes either to protocol or holders",
    HoldersRevenue: "Shield stakers get 40% of revenue shares",
    ProtocolRevenue: "The rest 60% revenue goes to the protocol"
}

const adapter: SimpleAdapter = {
    version: 1,
    methodology,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2023-08-09',
    dependencies: [Dependencies.ALLIUM]
}

export default adapter
