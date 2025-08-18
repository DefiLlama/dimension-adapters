import { parseEther } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SwapCoinEvent = "event SwapCoin(address indexed sender, address indexed coin, uint256 amountA, uint256 amountB, uint256 volume, uint8 side)"
const FastJpegFactory = '0x3BB7FBEeE877BD240de72A89AFd806BD3C1C8034';
// Constants
const UNDERGRADUATE_SUPPLY = parseEther('800000000'); // Max undergraduate supply
const GRADUATE_ETH = parseEther('10.6'); // ETH value of graduation

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

const calculateGweiVolume = (side: string, volume: bigint, amountCoinA: bigint) => {
    const totalCoins = amountCoinA;
    if (side === 'buy') {
        return (calculateSaleReturn(volume, totalCoins) * 10000n) / 9900n;
    } else {
        return (calculateSaleReturn(volume, totalCoins + volume) * 9900n) / 10000n;
    }
};


const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const data: any[] = await options.getLogs({
        target: FastJpegFactory,
        eventAbi: SwapCoinEvent,
    });
    data.forEach((log: any) => {
        const amountA = log.amountA;
        const volume = log.volume;
        const side = log.side;

        const gweiVolume = calculateGweiVolume(side, volume, amountA);
        
        dailyVolume.addGasToken(gweiVolume);
    });
    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter:{
      [CHAIN.BASE]: {
          fetch,
          start: '2025-04-09'
      }
    }
};

export default adapter;