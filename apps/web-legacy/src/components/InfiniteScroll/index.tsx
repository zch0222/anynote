import React, {ComponentType, ReactElement, useState, useRef, useEffect, ReactNode} from "react";
import Loading from "../Loading";
import {SWRResponse} from "swr";
import {PageBean, ResData} from "@/types/requestTypes";
import { Pagination as NextUIPagination } from "@nextui-org/react";
import ReactInfiniteScroll from 'react-infinite-scroll-component';
import useSWR from "swr";
import useNode from "@/hooks/useNode";
import {nanoid} from "nanoid";
import {node} from "prop-types";
import {AxiosResponse} from "axios";


function Page({ Item, swr, page, pageSize, params, itemProps }: {
    Item: ComponentType<{data: any, itemProps?: any}>,
    swr: ({params, page, pageSize}: {
        params: any,
        page: number,
        pageSize: number
    }) => SWRResponse<PageBean<any>>,
    page: number,
    pageSize: number,
    params: any
    itemProps?: any
}) {
    const { data } = swr({
        params: params,
        page: page,
        pageSize: pageSize
    })
    if (!data) {
        return <div className="flex justify-center items-center font-bold">加载中....</div>
    }
    return (
        <>
            {data.rows.map(data => (
                <div
                    className="flex-col justify-center w-full"
                    key={nanoid()}
                >
                    <Item itemProps={itemProps} data={data}/>
                </div>

            ))}
        </>
    )
}

function InfiniteScroll(props: {
    // Page: ComponentType<{
    //     page: number,
    //     pageSize: number,
    //     params: any,
    //     swr: ({params, page, pageSize}: {
    //         params: any,
    //         page: number,
    //         pageSize: number
    //     }) => SWRResponse<PageBean<any>>
    // }>,

    swr: ({params, page, pageSize}: {
        params: any,
        page: number,
        pageSize: number
    }) => SWRResponse<PageBean<any>>,
    params: any | undefined,
    Item: ComponentType<{data: any}>,
    itemProps?: any
    rowHeight: number,
    getPage: any
}) {

    // const pages: ReactElement[] = []

    const [pages, setPages] = useState<ReactElement[]>([]);

    const { swr, params, Item, itemProps, rowHeight, getPage } = props;
    const reactInfiniteScrollRef = useRef()

    const [divNode, divRef] = useNode()
    const [isLoading, setIsLoading] = useState(true)

    const [hasMore, setHasMore] = useState<boolean>(true)
    const [totalPages, setTotalPages] = useState(0)

    const [pageParam, setPageParam] = useState<{
        page: number,
        pageSize: number
    }>({
        page: 0,
        pageSize: 0,
    })

    // const { data, error } = swr({
    //     params: params,
    //     page: 1,
    //     pageSize: 1
    // })

    useEffect(() => {
        console.log(divNode)
        if (!divNode) {
            return
        }
        // @ts-ignore
        console.log("HEIGHT", Math.ceil(divNode.getBoundingClientRect().height / rowHeight) + 1)
        // @ts-ignore
        const pageSize = Math.ceil(divNode.getBoundingClientRect().height / rowHeight) + 1
        console.log(getPage)
        getPage({
            ...params,
            page: 1,
            pageSize: pageSize
        }).then(
            (res: any) => {
                setTotalPages(res.data.data.pages)
                setPageParam(prevState => ({
                    page: 1,
                    pageSize: pageSize
                }))
            }
        ).finally(
            () => setIsLoading(false)
        )
    }, [divNode, getPage, params, rowHeight]);

    useEffect(() => {
        console.log(pageParam)
        if (pageParam.page === 0) {
            return
        }
        if (hasMore && pageParam.page >= totalPages) {
            setHasMore(false)
        }
        const newPages: ReactElement[] = []
        for (let i = 0; i < pageParam.page; ++i) {
            newPages.push(<Page key={nanoid()} Item={Item} itemProps={itemProps} swr={swr} page={i + 1} pageSize={pageParam.pageSize} params={params}/>)
        }
        setPages(newPages)
    }, [Item, hasMore, itemProps, pageParam, params, swr, totalPages]);

    // useEffect(() => {
    //     // if (reactInfiniteScrollRef.current) {
    //     //     const resizeObserver = new ResizeObserver(entries => {
    //     //         for (let entry of entries) {
    //     //             console.log('Height:', entry.target.offsetHeight);
    //     //         }
    //     //     });
    //     //
    //     // }
    // }, [data])


    // for (let i = 0; i < pageParam.page; ++i) {
    //     pages.push(<Page key={nanoid()} Item={Item} itemProps={itemProps} swr={swr} page={i + 1} pageSize={pageParam.pageSize} params={params}/>)
    // }


    // const onPageChange = (page: number) => {
    //     console.log(page)
    //     setPageParam({
    //         ...pageParam,
    //         page: page
    //     })
    // }

    const next = () => {
        console.log("NEXT")
        setPageParam({
            ...pageParam,
            page: pageParam.page + 1
        })
    }

    return (
        <div
            id={"scrollableDiv"}
            className={`flex h-full flex-col w-full overflow-y-auto`}
            ref={divRef}
        >
            {isLoading ? <Loading/> :
                <>
                    <ReactInfiniteScroll
                        className="overflow-hidden"
                        next={next}
                        hasMore={hasMore}
                        loader={"loading..."}
                        dataLength={pages.length}
                        scrollableTarget="scrollableDiv"
                    >
                        {pages}
                    </ReactInfiniteScroll>

                    {totalPages === 0 ? <div className="m-auto p-3">无数据</div> : <></>}
                </>
            }
        </div>
    )
}

export default InfiniteScroll
