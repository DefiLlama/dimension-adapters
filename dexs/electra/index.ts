import {Adapter, FetchOptions, FetchV2,} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const projectStartTimestamp = 1727347548 // Sep 26 2024 13:45:48 PM
const cfdContractAddress = "0x4487BdD18a5c22c2ADd07c81725cbAd27E4af40e"
const tradeAbi = 'event NewTrade(uint256 indexed index, address indexed buyer, address indexed seller, uint80 filledPrice, uint192 filledAmount)'

export default {
    adapter: {
        [CHAIN.LUMIA]: {
            fetch: (async (options: FetchOptions) => {

                const dailyVolume = options.createBalances()

                const dailyVolumeLogs = await options.getLogs({
                    target: cfdContractAddress,
                    eventAbi: tradeAbi,
                })

                dailyVolumeLogs.map((e: any) => {
                    let amountDenormalized = Number(e.filledAmount) / 10 ** 8
                    let priceDenormalized = Number(e.filledPrice) / 10 ** 8
                    dailyVolume.addUSDValue(amountDenormalized * priceDenormalized)
                })

                return {dailyVolume}

            }) as FetchV2,
            start: projectStartTimestamp
        },
    },
    version: 2,
} as Adapter