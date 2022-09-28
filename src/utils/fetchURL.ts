import axios from "axios"
import asyncRetry from "async-retry"

export default async function fetchURL(url: string) {
    return asyncRetry(async () => await axios.get(url), {
        retries: 3
    })
}