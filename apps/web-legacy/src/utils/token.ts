import { cookies } from 'next/headers'

export function getToken(): string | null {

    const cookieStore = cookies()
    // console.log(cookieStore.get("user"))
    if (cookieStore.get("user") === undefined) {
        return null
    }
    if (undefined === cookieStore.get("user")?.value) {
        return null
    }
    else {
        return JSON.parse(cookieStore.get("user").value).token.accessToken
    }
}
