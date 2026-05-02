import { useSearchParams as useNextSearchParams, useRouter as useNextRouter, usePathname } from "next/navigation";


export default function useRouter() {
    const searchParams = useNextSearchParams();
    const router = useNextRouter();
    const nextPathname = usePathname();

    function getQueryParams(params:  {key: string, value: string}[]) {
        const newParams = new URLSearchParams(searchParams.toString())
        params.forEach(({key, value}) => {
            console.log(`key: ${key}, value: ${value}`)
            newParams.set(key, value)
        })
        return newParams.toString()
    }

    function setSearchParams(params:  {key: string, value: string}[], type: 'push' | 'replace' = 'replace') {
        const newParams = new URLSearchParams(searchParams.toString())
        params.forEach(({key, value}) => {
            console.log(`key: ${key}, value: ${value}`)
            newParams.set(key, value)
        })
        if (type === 'push') {
            router.push(`${nextPathname}?${newParams.toString()}`)
        }
        else {
            router.replace(`${nextPathname}?${newParams.toString()}`)
        }
    }

    function push({pathname, params}: {
        pathname: string,
        params:  {key: string, value: string}[]
    }) {
        router.push(`${pathname}?${getQueryParams(params)}`)
    }

    return {
        router: router,
        pathname: nextPathname,
        searchParams: searchParams,
        setSearchParams: setSearchParams,
        push: push
    }
}