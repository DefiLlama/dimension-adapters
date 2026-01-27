import { parseEther } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GraduateCointEvent = "event GraduateCoin(address indexed coin, address indexed pool)"
const SwapCoinEvent = "event SwapCoin(address indexed sender, address indexed coin, uint256 amountA, uint256 amountB, uint256 volume, uint8 side)"
const FastJpegFactory = '0x3BB7FBEeE877BD240de72A89AFd806BD3C1C8034';
// Constants
const UNDERGRADUATE_SUPPLY = parseEther('800000000'); // Max undergraduate supply
const GRADUATE_ETH = parseEther('10.6'); // ETH value of graduation
const GRADUATION_FEE = parseEther('0.5'); // 0.5 ETH
const CREATOR_FEE = parseEther('0.1'); // 0.1 ETH

export function calculatePriceForTokens(coinAmount: bigint, currentSupply: bigint): bigint {
    // For a quadratic curve: E = (GRADUATE_ETH * ((currentSupply + T)² - currentSupply²)) / UNDERGRADUATE_SUPPLY²

    const newSupply = currentSupply + coinAmount;

    // Calculate: (currentSupply + T)² - currentSupply²
    const newSupplySquared = newSupply ** 2n;
    const currentSupplySquared = currentSupply ** 2n;
    const supplyDeltaSquared = newSupplySquared - currentSupplySquared;

    // Calculate: (GRADUATE_ETH * supplyDeltaSquared) / UNDERGRADUATE_SUPPLY²
    const numerator = GRADUATE_ETH * supplyDeltaSquared;
    const denominator = UNDERGRADUATE_SUPPLY ** 2n;

    return numerator / denominator;
}

function calculateSaleReturn(coinAmount: bigint, currentSupply: bigint): bigint {
    // Uses the same formula as calculatePriceForTokens but in reverse
    return calculatePriceForTokens(coinAmount, currentSupply - coinAmount);
}

const calculateGweiFees = (side: string, volume: bigint, amountCoinA: bigint) => {
    const totalCoins = amountCoinA;
    if (side === 'buy') {
        const gweiVolume = (calculateSaleReturn(volume, totalCoins) * 10000n) / 9900n;
        return gweiVolume * 100n / 10000n;
    } else {
        const gweiVolume = (calculateSaleReturn(volume, totalCoins + volume) * 9900n) / 10000n;
        return gweiVolume * 100n / 9900n;
    }
};


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const protocolFees = options.createBalances();
    const userFees = options.createBalances();

    const swapEventLogs: any[] = await options.getLogs({
        target: FastJpegFactory,
        eventAbi: SwapCoinEvent,
    });
    swapEventLogs.forEach((log: any) => {
        const amountA = log.amountA;
        const volume = log.volume;
        const side = log.side;

        const ethFees = calculateGweiFees(side, volume, amountA);

        protocolFees.addGasToken(ethFees);
        dailyFees.addGasToken(ethFees);
    });

    const graduateCoinLogs: any[] = await options.getLogs({
        target: FastJpegFactory,
        eventAbi: GraduateCointEvent,
    });

    graduateCoinLogs.forEach((log: any) => {
        protocolFees.addGasToken(GRADUATION_FEE);
        userFees.addGasToken(CREATOR_FEE);

        dailyFees.addGasToken(GRADUATION_FEE + CREATOR_FEE);
    });


    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: protocolFees, dailyUserFees: userFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: '2025-04-09',
        }
    },
    methodology: {
        Fees: "Token trading and launching fees paid by users.",
        Revenue: "All fees are revenue.",
        ProtocolRevenue: "Revenue portion collected by FastJPEG.",
    }
};

export default adapter;