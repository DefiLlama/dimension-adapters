import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const pairContracts = [
    "0xC5184cccf85b81EDdc661330acB3E41bd89F34A1",
    "0x08064A8eEecf71203449228f3eaC65E462009fdF",
    "0x39Ea8e7f44E9303A7441b1E1a4F5731F1028505C",
    "0x3b037329Ff77B5863e6a3c844AD2a7506ABe5706",
    "0x22B12110f1479d5D6Fd53D0dA35482371fEB3c7e",
    "0x2d8ecd48b58e53972dBC54d8d0414002B41Abc9D",
    "0xCF1deb0570c2f7dEe8C07A7e5FA2bd4b2B96520D",
    "0x4A7c64932d1ef0b4a2d430ea10184e3B87095E33",
    "0x3F2b20b8E8Ce30bb52239d3dFADf826eCFE6A5f7",
    "0x212589B06EBBA4d89d9deFcc8DDc58D80E141EA0",
    "0x55c49c707aA0Ad254F34a389a8dFd0d103894aDb",
    "0xb5575Fe3d3b7877415A166001F67C2Df94D4e6c1",
    "0x24CCBd9130ec24945916095eC54e9acC7382c864"
]

const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec"
const feeDepostController = "0x7E3D2F480AbbA95863040D763DDe8F30D100C6F5"

const abi = {
    addInterest: "event AddInterest(uint256 interestEarned, uint256 rate)",
    splits: "function splits() external view returns (tuple(uint80 insurance, uint80 treasury, uint80 platform))"
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()
    
    const splits = await options.api.call({
        target: feeDepostController,
        abi: abi.splits
    })

    const treasuryRatio = BigInt(splits.treasury)
    const platformRatio = BigInt(splits.platform)

    const addInterestLogs = (await options.getLogs({
        targets: pairContracts, 
        eventAbi: abi.addInterest,
        flatten: false
      }))
    
      addInterestLogs.forEach((logs) => {
        if (!logs.length) return
        let totalFees = 0n
        for (const log of logs) {
            const fees = BigInt(log.interestEarned.toString())
            totalFees += fees
        }
        dailyFees.add(reUSD, totalFees)
        const treasuryFees = (totalFees * treasuryRatio) / 10_000n
        const holdersFees = (totalFees * platformRatio) / 10_000n
        dailyHoldersRevenue.add(reUSD, holdersFees)
        dailyProtocolRevenue.add(reUSD, treasuryFees)
        dailyRevenue.add(reUSD, treasuryFees + holdersFees)
    })
    
    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.subtract(dailyRevenue)

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    }

}


const methodology = {
    dailyFees: "Total interest paid by borrowers",
    dailyRevenue: "Protocol's share of interest (treasury + RSUP stakers)",
    dailyProtocolRevenue: "Treasury's portion of interest",
    dailyHoldersRevenue: "Platform fees distributed to RSUP stakers",
    dailySupplySideRevenue: "Interest paid to lenders"
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2025-03-13',
            meta: {
                methodology
            }
        },
    },
    
    version: 2
}

export default adapters;