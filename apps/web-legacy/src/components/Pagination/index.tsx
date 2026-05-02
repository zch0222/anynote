import {ComponentType, ReactElement, useState} from "react";
import Loading from "../Loading";
import {SWRResponse} from "swr";
import {PageBean} from "@/types/requestTypes";
import {Pagination as NextUIPagination} from "@nextui-org/react";
import {Empty} from "antd";


function Pagination(props: {
    Page: ComponentType<{
        page: number,
        pageSize: number,
        params: any,
        swr: ({params, page, pageSize}: {
            params: any,
            page: number,
            pageSize: number
        }) => SWRResponse<PageBean<any>>
    }>,
    swr: ({params, page, pageSize}: {
        params: any,
        page: number,
        pageSize: number
    }) => SWRResponse<PageBean<any>>,
    params: any | undefined,
    direction: "col" | "row",
    isShowTotal?: boolean
}) {

    const pages: ReactElement[] = []

    const {Page, swr, params, direction, isShowTotal = false} = props;

    const [hasMore, setHasMore] = useState<boolean>(true)

    const [pageParam, setPageParam] = useState<{
        page: number,
        pageSize: number
    }>({
        page: 1,
        pageSize: 10,
    })

    const {data, error} = swr({
        params: params,
        page: 1,
        pageSize: 10
    })

    if (!data) {
        console.log("Loading....")
        return <Loading/>
    }


    if (hasMore && pageParam.page >= data.pages) {
        setHasMore(false)
    }

    const onPageChange = (page: number) => {
        console.log(page)
        setPageParam({
            ...pageParam,
            page: page
        })
    }

    // for (let i = 0; i < pageParam.page; ++i) {
    //     pages.push(
    //         <Page
    //             key={i}
    //             pageSize={pageParam.pageSize}
    //             page={i+1}
    //             params={params}
    //             swr={swr}
    //         />
    //     )
    // }

    return (
        <div
            className={`flex h-full flex-col w-full overflow-y-auto overflow-x-hidden`}
        >
            <div className={`flex ${"row" === direction ? "flex-row flex-wrap" : "flex-col"} p-[10px]`}>
                <Page
                    pageSize={pageParam.pageSize}
                    page={pageParam.page}
                    params={params}
                    swr={swr}
                />
            </div>
            {data.rows.length > 0 ?
                <div className="flex flex-row items-center h-[60px] box-border p-1">
                    <NextUIPagination
                        className="text-white"
                        showControls
                        total={data.pages}
                        initialPage={1}
                        onChange={onPageChange}
                    />
                    {isShowTotal ? <div className="ml-2 text-base font-bold">{`Total: ${data.total}`}</div> : <></>}
                </div>
                : <Empty description={"暂无数据"} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </div>
    )
}

export default Pagination
