import { Adapter, FetchResultVolume } from "../../adapters/types";

const getVolumeStats = async (): Promise<FetchResultVolume> => {
    return fetch("https://api-mainnet-dusa.up.railway.app/volume")
        .then((res) => res.json())
        .then((res) => res.data);
};

const adapter: Adapter = {
    adapter: {
        ethereum: {
            fetch: getVolumeStats,
            start: 1669420800,
        },
    },
};

export default adapter;
