'use client'
import {useState, useRef, useEffect} from "react";
// @ts-ignore
import { usePdf } from '@mikecousins/react-pdf';
import {Card, Button, Image, CardHeader, CardBody, Input, Chip} from "@nextui-org/react";
import { Document, Page, pdfjs, Outline } from "react-pdf";
import Plus from "@/components/svg/Plus";
import Reduce from "@/components/svg/Reduce"
import Catalogue from "@/components/svg/Catalogue";
import {Drawer, Dropdown, message, Space} from "antd";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { useTheme } from "next-themes";
import "react-pdf/dist/esm/Page/AnnotationLayer.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import type { MenuProps } from 'antd';
import {MoreOutlined} from "@ant-design/icons";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

import PDFPage from "@/components/chat-pdf/PDFPage";
import Chat from "@/components/chat-pdf/Chat";
import Loading from "@/components/Loading";
import Close from "@/components/svg/Close";
import { indexDoc, deleteDoc } from "@/requests/client/note/doc";
import {blob} from "stream/consumers";
import {nanoid} from "nanoid";
import {DocVO} from "@/types/noteTypes";
import {showMessage} from "@/store/message/messageSlice";
import {router} from "next/client";
import useIsMobile from "@/hooks/useIsMobile";



pdfjs.GlobalWorkerOptions.workerSrc = "https://anynote.obs.cn-east-3.myhuaweicloud.com/cdn/pdfjs-dist/%403.11.174/build/pdf.worker.js"
function PDFViewer({ src, docId, doc, isShowAIModule, isShowTitle }: {
    src: string,
    docId: number,
    doc: DocVO,
    isShowAIModule: boolean,
    isShowTitle: boolean | undefined
}) {
    const { theme } = useTheme()

    const router = useRouter()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    const [page, setPage] = useState(1)
    const [isShowChat, setIsShowChat] = useState<boolean>(false)
    const [isCatalogueDrawerOpen, setIsCatalogueDrawerOpen] = useState<boolean>(false)
    const [scale, setScale] = useState(0.9)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [numPages , setNumPages ] = useState(0)
    const [inputPage, setInputPage] = useState<string>(page.toString())
    const isMobile = useIsMobile()

    const viewerBackgroundColor = theme === 'light' ? "bg-[#F7F7F8]" : "bg-black"


    useEffect(() => {
        fetch(src)
            .then(res => res.blob())
            .then(data => {
                const url = URL.createObjectURL(data)
                console.log(url)
                setPdfUrl(url)
            })
    }, [src])

    useEffect(() => {
        if (isMobile) {
            setScale(0.6)
        }
    }, [isMobile]);

    useEffect(() => {
        if (page.toString() !== inputPage) {
            console.log("Change input page")
            setInputPage(page.toString())
        }
    }, [page]);

    const fetchIndexDoc = useCallback(() => {
        indexDoc(doc.id).then(res => {
            console.log(res)
            showMessage({
                type: "success",
                content: "索引任务开始"
            })
            message.success("索引任务提交")
        }).catch(
            e => console.log(e)
        )
    }, [doc])

    const fetchDeleteDoc = useCallback(() => {
        deleteDoc(doc.id).then(res => {
            console.log(res)
            message.success("删除文档成功").then(() => {
                router.back()
            })
        }).catch(
            e => console.log(e)
        )
    }, [doc])


    const items: MenuProps['items'] = [
        // {
        //   key: '1',
        //   label: (
        //       // <div
        //       //     onClick={() => {
        //       //         fetchIndexDoc()
        //       //     }}
        //       // >
        //       //     建立索引
        //       // </div>
        //   )
        // },
        {
            key: '2',
            label: (
                <div
                    className="text-red-600"
                    onClick={() => fetchDeleteDoc()}
                >
                    删除
                </div>
            ),
        },
    ];

    const getIndexStatusChip = (indexStatus: number) => {
        if (0 === indexStatus) {
            return <Chip className="text-white select-none" color="success">已索引</Chip>
        }
        else if (1 == indexStatus) {
            return <Chip className="text-white select-none" color="primary">索引中</Chip>
        }
        else if (2 == indexStatus) {
            return <Chip className="text-white select-none" color="danger">索引失败</Chip>
        }
        else if (3 == indexStatus) {
            return <Chip className="text-white select-none" color="default">未索引</Chip>
        }
        return <></>
    }

    const previous = () => {
        if (page > 1) {
            setPage(page - 1)
        }
    }

    const next = () => {
        if (page < numPages) {
            setPage(page + 1)
        }
    }

    const onItemClick = ({ pageIndex }: {
        pageIndex: number
    }) => {
        // 实现页面导航逻辑
        console.log(`Navigating to page: ${pageIndex + 1}`);
        setPage(pageIndex + 1)
    };

    if (!pdfUrl) {
        return (
            <Loading/>
        )
    }



    return (
        <div className="w-full h-full overflow-y-auto">


            {
                isShowChat ?
                    <Card className="absolute z-50 max-w-[500px] max-h-[800px] w-[80%] h-[80%] right-2 top-[70px]">
                        <CardHeader className="flex flex-row justify-end">
                            <div
                                className="w-[35px] h-[35px] cursor-pointer"
                                onClick={() => setIsShowChat(false)}
                            >
                                <Close
                                    width={35}
                                    height={35}
                                />
                            </div>
                        </CardHeader>
                        <CardBody>
                            <Chat
                                docId={docId}
                            />
                        </CardBody>
                    </Card>
                :
                <></>
            }
            <div className="flex flex-col items-center w-full h-full">
                <Card
                    className="flex flex-row items-center justify-center w-full p-1 pl-2 pr-2 h-[60px] min-h-[60px]"
                    radius="none"
                >
                    <Button
                        className="mr-2"
                        variant="light"
                        size={isMobile ? "sm" : "md"}
                        onClick={() => setIsCatalogueDrawerOpen(!isCatalogueDrawerOpen)}
                    >
                        <Catalogue width={16} height={16}/>
                    </Button>
                    {isMobile || false == isShowTitle ? <></> :
                        <div className="font-bold text-base mr-5">
                            {doc.docName}
                        </div>
                    }
                    <Button size="sm" onClick={previous}>Previous</Button>
                    <div className="flex justify-center items-center mr-1 ml-1">
                        <span>
                            <Input
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setPage(+inputPage)
                                    }
                                }}
                                size="sm"
                                className="w-[60px]"
                                value={inputPage}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (/^\d+$/.test(value)) {
                                        if (+value > numPages) {
                                            setInputPage(numPages.toString())
                                        } else {
                                            setInputPage(value)
                                        }
                                    } else if (value === '') {
                                        // 允许清空输入
                                        setInputPage('')
                                    }
                                }}
                            />
                        </span>
                        {`/${numPages}`}
                    </div>
                    <Button size="sm" onClick={next}>
                        Next
                    </Button>
                    <div
                        className="ml-2 cursor-pointer select-none"
                        onClick={() => {
                            if (parseFloat(scale.toFixed(1)) > 0.1) {
                                setScale(scale - 0.1)
                            }
                        }}
                    >
                        <Reduce width={16} height={16}/>
                    </div>
                    <div className="flex justify-center items-center w-[45px] select-none">
                        {`${(100 * scale).toFixed(0)}%`}
                    </div>
                    <div
                        className="cursor-pointer select-none"
                        onClick={() => {
                            if (scale < 4.5) {
                                setScale(scale + 0.1)
                            }
                        }}
                    >
                        <Plus width={16} height={16}/>
                    </div>
                    {
                        false === isShowAIModule ? <></> :
                            <div className="flex-grow flex flex-row justify-end items-center">
                                {/*<div className="mr-2">*/}
                                {/*    {getIndexStatusChip(doc.indexStatus)}*/}
                                {/*</div>*/}
                                <Dropdown
                                    menu={{items}}
                                    className="mr-2"
                                >
                                    <Button
                                        isIconOnly={true}
                                        variant="light"
                                    >
                                        <MoreOutlined
                                            style={{
                                                fontSize: 25
                                            }}
                                        />
                                    </Button>
                                </Dropdown>
                                <Card isPressable className="rounded-[50px]" onClick={() => {
                                    setIsShowChat(!isShowChat)
                                }}>
                                    <Image
                                        className="select-none object-cover rounded-[50px] w-[50px] h-[50px]"
                                        src="https://anynote.obs.cn-east-3.myhuaweicloud.com/images/gpt_button.jpg"
                                        alt="chat"
                                    />
                                </Card>
                            </div>
                    }
                </Card>
                <div
                    className={`w-full flex-grow overflow-auto ${viewerBackgroundColor}`}
                >
                    <div className="z-0 relative w-full min-h-full flex flex-col items-center overflow-y-auto">
                        <Drawer
                            mask={false}
                            contentWrapperStyle={{
                                width: 350
                            }}
                            closeIcon={null}
                            placement="left"
                            open={isCatalogueDrawerOpen}
                            getContainer={false}
                            onClose={() => setIsCatalogueDrawerOpen(false)}
                        >
                            <div className="flex flex-col w-full overflow-auto">
                                <Document
                                    className="h-full w-full"
                                    file={pdfUrl}
                                    onLoadSuccess={({numPages}) => {
                                        console.log(numPages)
                                    }}
                                    onLoadError={(e) => {
                                        console.log(e)
                                    }}

                                >
                                    <Outline onItemClick={onItemClick}/>

                                    {/*{new Array(numPages).fill('').map((item, index) => {*/}
                                    {/*    return (*/}
                                    {/*        <div*/}
                                    {/*            className="mt-2 select-none cursor-pointer"*/}
                                    {/*            key={index}*/}
                                    {/*            onClick={() => setPage(index+1)}*/}
                                    {/*        >*/}
                                    {/*            <Page className="select-none" pageNumber={index+1} width={150}/>*/}
                                    {/*            <div>*/}
                                    {/*                {index + 1}*/}
                                    {/*            </div>*/}
                                    {/*        </div>*/}
                                    {/*    )*/}
                                    {/*})}*/}
                                </Document>
                            </div>
                        </Drawer>

                        <Document
                            file={pdfUrl}
                            onLoadSuccess={({ numPages } ) => {
                                setNumPages(numPages)
                            }}
                            onItemClick={onItemClick}
                        >
                            <Page className="w-[80%]" pageNumber={page} scale={scale}/>
                        </Document>
                    </div>

                </div>

            </div>
        </div>
    )
}

export default withThemeConfigProvider(PDFViewer)

