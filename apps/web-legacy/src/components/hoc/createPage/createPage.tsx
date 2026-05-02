import {SWRResponse} from "swr";
import {Listbox, ListboxItem} from "@nextui-org/react";
import {PageBean} from "@/types/requestTypes";
import {ComponentType} from "react";
import Loading from "@/components/Loading";
import { nanoid } from "nanoid";
import {Row} from "antd";


export default function createPage(Item: ComponentType<{data: any}>) {

    return function Page({ page, pageSize, swr, params }: {
        params: any,
        page: number,
        pageSize: number,
        swr: ({params, page, pageSize}: {
            params: any,
            page: number,
            pageSize: number
        }) => SWRResponse<PageBean<any>>
    }) {
        const { data, error } = swr({
            page: page,
            pageSize: pageSize,
            params: params
        })

        console.log(page)

        if (!data) {
            return (
                <div className="flex-grow p-0">
                    <Loading/>
                </div>
            )
        }


        return (
            <Row gutter={[16,16]} className={"w-full"}>
                {data.rows.map(item => (
                    <Item key={nanoid()} data={item}/>
                ))}
            </Row>


            // <div className="w-full">
            //     {data.rows.map(item => (
            //         <Item
            //             key={nanoid()}
            //             data={item}
            //         />
            //     ))}
            // </div>
        )
    }
}
