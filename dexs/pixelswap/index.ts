import fetchURL from '../../utils/fetchURL'

const fetch = async () => {
    const volumeApiResult = await fetchURL(
        'https://api.pixelswap.ip-dynamic.org/apis/pairs',
    );
    const volumeResult = volumeApiResult.data.pairs;
    let dailyVolumeResult = 0;
    let totalVolumeResult = 0;
    volumeResult.forEach(pairs => {
        dailyVolumeResult += Number(pairs.volume.dailyVolume / (10 ^ Number(pairs.token1.decimals)) * pairs.token1.usdPrice);
        totalVolumeResult += Number(pairs.volume.totalVolume / (10 ^ Number(pairs.token1.decimals)) * pairs.token1.usdPrice);
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