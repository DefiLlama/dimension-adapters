import {SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://api.sunperp.com/sapi/v1/public/open_interest";

async function fetch(){
    const {data} = await fetchURL(API_URL);
    const openInterestAtEnd = data.reduce((acc:number,tokenData:any)=>acc+tokenData.value,0);
    return {
        openInterestAtEnd
    }
}

const adapter: SimpleAdapter = {
    fetch,
    runAtCurrTime: true,
    chains:[CHAIN.TRON]
}

export default adapter