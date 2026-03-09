import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const RAILGUN_PROXY = "0x26111e2379E5fC0A7Cd8728fe52c7b84CA4fbE85";

const topic0_shield = '0x3a5b9dc26075a3801a6ddccf95fec485bb7500a91b44cec1add984c21ee6db3b';

const shieldEventAbi = "event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments, (bytes32[3] encryptedBundle, bytes32 shieldKey)[] shieldCiphertext, uint256[] fees)";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const logs = await options.getLogs({
        target: RAILGUN_PROXY,
        topics: [topic0_shield],
        eventAbi: shieldEventAbi,
    });

    logs.forEach((log) => {
        log.commitments.forEach((commitment: any) => {
            dailyVolume.add(commitment.token.tokenAddress, commitment.value);
        });
    });

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: "2026-02-20",
        },
    },
    methodology: {
        Volume: "Sum of all assets shielded into B402's Railgun privacy pool on Base. Tracks Shield events emitted by the Railgun proxy contract to measure private transaction volume.",
    },
};

export default adapter;
