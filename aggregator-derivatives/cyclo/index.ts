import { ZeroHash } from "ethers"
import { Balances } from "@defillama/sdk"
import { CHAIN } from "../../helpers/chains"
import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types"

type Vault = { address: string, start: number, asset: string, startTime: string }
type Vaults = Record<string, Vault>

const ChainVaults: Record<string, Vaults> = {
    [CHAIN.FLARE]: {
        cysflr: {
            start: 34244389, // cysflr deployement block
            startTime: "2024-12-09", // cysflr deployment date
            address: "0x19831cfB53A0dbeAD9866C43557C1D48DfF76567", // cysflr
            asset: "0x12e605bc104e93B45e1aD99F9e555f659051c2BB", // sflr
        },
        cyweth: {
            start: 36028901, // cyweth deployement block
            startTime: "2025-01-13", // cyweth deployment date
            address: "0xd8BF1d2720E9fFD01a2F9A2eFc3E101a05B852b4", // cyweth
            asset: "0x1502FA4be69d526124D453619276FacCab275d3D", // weth
        },
    },
} as const

const TransferEventAbi = 'event Transfer (address indexed from, address indexed to, uint256 value)' as const
const TransferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

// get mint vol for cyclo tokens
async function mints(options: FetchOptions, dailyVolume: Balances, targets: string[]) {
    const logs = await options.getLogs({
        targets,
        flatten: true,
        parseLog: true,
        entireLog: true,
        eventAbi: TransferEventAbi,
        topics: [TransferEventTopic, ZeroHash, undefined as any],
    })
    logs.forEach(log => {
        dailyVolume.add(log.address, log.parsedLog.args[2].toString())
    })
}

// get burn vol for cyclo tokens
async function burns(options: FetchOptions, dailyVolume: Balances, targets: string[]) {
    const logs = await options.getLogs({
        targets,
        flatten: true,
        parseLog: true,
        entireLog: true,
        eventAbi: TransferEventAbi,
        topics: [TransferEventTopic, undefined as any, ZeroHash],
    })
    logs.forEach(log => {
        dailyVolume.add(log.address, log.parsedLog.args[2].toString())
    })
}

const fetchVolume: FetchV2 = async function (options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const targets = Object.values(ChainVaults[options.api.chain]).map(v => v.address)

  await Promise.allSettled([
    mints(options, dailyVolume, targets), // mint vols
    burns(options, dailyVolume, targets), // burn vols
  ])

  return { dailyVolume }
}

const volAdapter: BaseAdapter = {
    [CHAIN.FLARE]: {
        fetch: fetchVolume,
        start: Object.values(ChainVaults[CHAIN.FLARE])
            .reduce((a, b) => a.start < b.start ? a : b)
            .startTime,
        meta: {
            methodology: {
                Volume: "Volume of Cyclo tokens that get minted and burned."
            }
        }
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: volAdapter
}

export default adapter
