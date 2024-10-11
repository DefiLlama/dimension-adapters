import fetchURL from '../../utils/fetchURL'

const fetch = async () => {
    const swapVolumeApiResult = await fetchURL(
        'https://api.pixelswap.io/apis/pairs',
    );
    const depositAndWithdrawVolumeResult = await fetchURL(
        'https://api.pixelswap.io/apis/tokens',
    );
    const swapvolumeResult = swapVolumeApiResult.data.pairs;
    const depositAndWithdrawVolume = depositAndWithdrawVolumeResult.data.tokens;
    let dailyVolumeResult = 0;
    let totalVolumeResult = 0;
    swapvolumeResult.forEach(pairs => {
        dailyVolumeResult += Number(pairs.volume.dailyVolume / (Math.pow(10, Number(pairs.token1.decimals))) * pairs.token1.usdPrice);
        totalVolumeResult += Number(pairs.volume.totalVolume / (Math.pow(10, Number(pairs.token1.decimals))) * pairs.token1.usdPrice);
    });

    depositAndWithdrawVolume.forEach(token => {
        dailyVolumeResult += Number(token.volume.dailyVolume / (Math.pow(10, Number(token.decimals))) * token.usdPrice);
        totalVolumeResult += Number(token.volume.totalVolume / (Math.pow(10, Number(token.decimals))) * token.usdPrice);
    });

    return {
        dailyVolume: dailyVolumeResult,
        totalVolume: totalVolumeResult,
    }
}

const adapter = {
    adapter: {
        ton: {
            fetch,
            start: 1726034340,
        },
    },
}

export default adapter