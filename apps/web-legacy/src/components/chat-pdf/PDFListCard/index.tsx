'use client'
import { Card, Image } from "@nextui-org/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import withThemeConfigProvider from "../../hoc/withThemeConfigProvider";

function PDFListCard() {

    const router = useRouter()

    const [pdfList, setPdfList] = useState<{
        id: number,
        cover: string,
        url: string
    }[]>([
        {
            id: 1,
            cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/pdf/cover/20231123205818.png",
            url: "https://us.wepc.yxlm.cloud/d/mnt/upload/2022.pdf"
        }
    ])

    return (
        <Card className="w-[80%] h-[80%]">
            <div className="flex flex-row flex-wrap p-5">
                {pdfList.map(item => (
                    <Card
                        key={item.id}
                        isPressable
                        onClick={() => router.push(`/pdf/view?url=${item.url}`)}
                    >
                        <Image
                            className="object-cover"
                            width={150}
                            height={200}
                            src={item.cover}
                            alt={"pdf"}
                        />
                    </Card>
                ))}
            </div>
        </Card>
    )
}

export default PDFListCard
