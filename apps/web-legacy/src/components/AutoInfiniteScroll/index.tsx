'use client'

import { AutoSizer } from 'react-virtualized';
import VirtualList from 'rc-virtual-list';
import { List } from "antd";

import {ReactElement, useCallback, useEffect} from "react";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import React, {ComponentType, useState} from "react";
import {SWRResponse} from "swr";
import {PageBean} from "@/types/requestTypes";
import {nanoid} from "nanoid";
import Loading from "@/components/Loading";
import InfiniteScroll from 'react-infinite-scroll-component';


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

function AutoInfiniteScroll({ swr, params, Item, itemProps, rowHeight }: {
    swr: ({params, page, pageSize}: {
        params: any,
        page: number,
        pageSize: number
    }) => SWRResponse<PageBean<any>>,
    params: any | undefined,
    Item: ComponentType<{data: any}>,
    itemProps?: any,
    rowHeight: number
}) {

    const [hasMore, setHasMore] = useState<boolean>(true)

    const [pageParam, setPageParam] = useState<{
        page: number,
        pageSize: number
    }>({
        page: 1,
        pageSize: 15,
    })

    const [pages, setPages] = useState<{
        key: string,
        item: ReactElement
    }[]>([])


    const { data, error } = swr({
        params: params,
        page: 1,
        pageSize: 15
    })

    const rowRender = useCallback((value:any) => {
        console.log(value)
        console.log(pages)
        return (pages.map(page => {
            console.log(page)
            return page
        }))
    }, [pages])

    useEffect(() => {
        for (let i = 0; i < pageParam.page; ++i) {
            console.log(i)
            setPages(prePages => {
                for (let i = 0; i < pageParam.page; ++i) {
                    prePages.push({
                        key: nanoid(),
                        item: <Page key={nanoid()} Item={Item} itemProps={itemProps} swr={swr} page={i + 1} pageSize={pageParam.pageSize} params={params}/>
                    })
                }
                return prePages
            })
        }
    }, [Item, itemProps, pageParam, params, swr]);

    if (!data) {
        console.log("Loading....")
        return <Loading/>
    }

    const next = () => {
        setPageParam({
            ...pageParam,
            page: pageParam.page + 1
        })
    }

    if (hasMore && pageParam.page >= data.pages) {
        setHasMore(false)
    }




    return (
        <AutoSizer>
            {({width, height}) => (
                <div>{height}</div>
                // <InfiniteScroll
                //     next={next} hasMore={hasMore}
                //     loader={"loading..."}
                //     dataLength={pages.length}
                //
                // />
                // <List
                //     data={pages}
                //     rowCount={data?.pages}
                //     height={height}
                //     rowHeight={rowHeight}
                //     width={width}
                //     overscanRowCount={3}
                // >
                //     {...pages}
                // </List>
                // <VirtualList
                //     data={pages}
                //     itemKey={"key"}
                //     height={height}
                //     itemHeight={rowHeight * pageParam.pageSize}
                //     onScroll={(e: React.UIEvent<HTMLElement, UIEvent>) => {
                //         // Refer to: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight#problems_and_solutions
                //         if (Math.abs(e.currentTarget.scrollHeight - e.currentTarget.scrollTop - height) <= 1) {
                //             setPageParam({
                //                 ...pageParam,
                //                 page: pageParam.page + 1
                //             })
                //         }
                //     }}>
                //     {item =>
                //         <div>{item.item}</div>
                //     }
                // </VirtualList>

            )}
        </AutoSizer>
    )
}

export default withThemeConfigProvider(AutoInfiniteScroll)