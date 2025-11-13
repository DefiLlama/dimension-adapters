import { Adapter, FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { findClosest } from "../../helpers/utils/findClosest"
import { httpGet } from "../../utils/fetchURL";
import { ethers } from "ethers";
import ADDRESSES from '../../helpers/coreAssets.json';

const TETHER_TREASURY = "0x5754284f345afc66a98fbB0a0Afe71e0F007B949";
const TRANSFER_EVENT = "event Transfer (address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function buildStablecoinAdapter(stablecoinId: string, daysBetweenAttestations:number, attestations: {
    time: string, // time of report
    circulation: number, // billions of USDC in circulation
    allocated: number, // billions in tbills + repos + money market funds (DON'T INCLUDE CASH!)
    tbillRate: number // % interest earned in treasury bills
}[]) {
    const adapter: Adapter = {
        version: 2,
        adapter: {
            ethereum: {
                fetch: async (options: FetchOptions) => {
                    const dailyFees = options.createBalances()

                    const stablecoinData = await httpGet(`https://stablecoins.llama.fi/stablecoin/${stablecoinId}`)

                    const supply = (findClosest(options.fromTimestamp, stablecoinData.tokens.map((d: any)=>({...d, time: d.date*1e3})), 1.5 * 24 * 3600) as any).circulating.peggedUSD

                    const closestAttestation = findClosest(options.fromTimestamp, attestations)
                    if (new Date(closestAttestation.time).getTime() - 1.2 * daysBetweenAttestations * 24 * 3600e3 > options.fromTimestamp * 1e3) {
                        throw new Error("Trying to refill with no attestations, pls add attestations")
                    }

                    const tbills = supply * closestAttestation.allocated / closestAttestation.circulation
                    const annualYield = tbills * closestAttestation.tbillRate / 100 // yield in repos (SOFR) and yield in tbills is almost the same
                    const decimals = 1e6 // assuming 6 decimals
                    dailyFees.add(stablecoinData.address, decimals * annualYield / 365, METRIC.ASSETS_YIELDS)

                    if (stablecoinId === '1') {
                        const acquisitionLogs = await options.getLogs({
                            eventAbi: TRANSFER_EVENT,
                            topics: [
                                TRANSFER_TOPIC,
                                ethers.zeroPadValue(TETHER_TREASURY, 32),
                            ],
                            target: ADDRESSES.ethereum.USDT
                        });

                        acquisitionLogs.forEach((acquisition: any) => {
                            const acquisitionAmount = Number(acquisition.value) / 1e6;
                            dailyFees.addUSDValue(acquisitionAmount / 1000);
                        });

                        const redemptionLogs = await options.getLogs({
                            eventAbi: TRANSFER_EVENT,
                            topics: [
                                TRANSFER_TOPIC,
                                null as any,
                                ethers.zeroPadValue(TETHER_TREASURY, 32),
                            ],
                            target: ADDRESSES.ethereum.USDT
                        });
                        
                        redemptionLogs.forEach((redeem: any) => {
                            const redemptionAmount = Number(redeem.value) / 1e6;
                            dailyFees.addUSDValue(Math.max(1000, redemptionAmount / 1000));
                        });
                    }

                    return {
                        dailyFees,
                        dailyRevenue: dailyFees,
                        dailyProtocolRevenue: dailyFees,
                    }
                },
            }
        }
    }

    return adapter
}
