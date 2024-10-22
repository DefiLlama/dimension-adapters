import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { BigNumberish, ethers } from 'ethers';
import { httpGet } from "../utils/fetchURL";

const provider = new ethers.JsonRpcProvider('https://mainnet-rpc.assetchain.org');
const contractAddress = '0xFC00FACE00000000000000000000000000000000';


async function getFees24Hr() {
    try {
        const abi = [
            'function currentSealedEpoch() view returns (uint256)',
            'function getEpochSnapshot(uint256 epoch) view returns (uint256 endTime, uint256 epochFee, uint256 totalBaseRewardWeight, uint256 totalTxRewardWeight, uint256 baseRewardPerSecond, uint256 totalStake, uint256 totalSupply)'
        ];
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const currentEpoch = await contract.currentSealedEpoch();

        // Calculate how many 4-hour epochs are in 24 hours (6 epochs)
        const epochsToFetch = 6;
        const epochs: any = [];

        // Create array of epoch numbers to fetch (current and previous 5)
        for (let i = 0; i < epochsToFetch; i++) epochs.push(currentEpoch.toString() - i);

        // Fetch all epoch data in parallel
        const epochData = await Promise.all(await epochs.map((epoch: any) => contract.getEpochSnapshot(epoch)));

        // Calculate total fees and volume
        let totalFees: BigInt = BigInt(0);
        epochData.forEach((data: any) => {
            const { epochFee } = data;
            totalFees = totalFees += epochFee;
        });

        return ethers.formatEther(totalFees as unknown as BigNumberish);

    } catch (error) {
        console.error('Error fetching fees:', error);
        throw error;
    }
}

export async function convertRwaToUsd(amountInRwa: number) {
    const url = 'https://price.assetchain.org/api/v1/price';
    const result = await httpGet(url, {
        responseType: 'blob', headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Content-Type": "text/csv; charset=utf-8",
            "Accept": "text/csv; charset=utf-8",
            "origin": url,
        }
    });
    const data = JSON.parse(result);
    return data.data.price * amountInRwa;
}

convertRwaToUsd(820);


const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.ASSETCHAIN]: {
            fetch: async () => {
                const feesInRwa = await getFees24Hr();
                const feesInUsd = await convertRwaToUsd(Number(feesInRwa))
                return {
                    dailyFees: feesInUsd,
                    dailyRevenue: feesInUsd
                }
            },
            start: 1598671449,
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter;
