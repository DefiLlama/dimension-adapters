import axios from "axios"
import asyncRetry from "async-retry"

export default async function fetchURL(url: string) {
    return asyncRetry(async () => await axios.get(url), {
        retries: 3
    })
}

export async function postURL(url: string, data: any) {
    return asyncRetry(async () => await axios.post(url, data), {
        retries: 3
    })
}
