'use client'

import {useEffect, useMemo, useRef, useState} from "react";
import {Button} from "@nextui-org/react";
import { PRIMARY_COLOR } from "@/constants/color";
import { scrollTo } from "@/utils/nodeUtil";
import { useRouter } from "next/navigation";
import useNode from "@/hooks/useNode";
import MarkDownEditor from "@/components/MarkDownEditor";


export default function HomeTop() {

    const router = useRouter()
    const [canvas, canvasRef] = useNode()
    // const index = useRef<number>(0)

    const selectList = useMemo(() => (
        [
            {
                index: 0,
                key: "docQuery",
                title: "GPT本地知识库接入",
                button: (
                    <Button
                        className="text-primary w-[150px]"
                        size="lg"
                        color="primary"
                        variant="bordered"
                        onClick={() => {
                            scrollTo("docQuery")
                        }}
                    >
                        立即体验
                    </Button>
                )
            },
            {
                index: 1,
                key: "noteEditor",
                title: "所见即所得的笔记编辑器",
                button: (
                    <Button
                        className="text-primary w-[150px]"
                        size="lg"
                        color="primary"
                        variant="bordered"
                        onPress={() => {
                            scrollTo("noteEditor")
                        }}
                    >
                        立即体验
                    </Button>
                )
            },
            {
                index: 2,
                key: "top",
                title: "不只是笔记",
                button: (
                    <Button
                        className="text-primary w-[150px]"
                        size="lg"
                        color="primary"
                        variant="bordered"
                        onPress={() => router.push("/register")}
                    >
                        立即注册
                    </Button>
                )
            },
        ]
    ), [])

    const [selected, setSelected] = useState<{
        index: number,
        key: string,
        title: string,
        button: JSX.Element
    }>(selectList[0])

    // const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isSelectedChanged = useRef<boolean>(false)
    // const [startTime, setStartTime] = useState<null | number>(null)

    const [stayPercent, setStayPercent] = useState(0);
    //
    // useEffect(() => {
    //     const interval = setInterval(() => {
    //
    //         setStayPercent(prevStayPercent => {
    //             console.log(prevStayPercent)
    //             if (prevStayPercent >= 1) {
    //                 setSelected(selectList[(selected.index+1) % 2])
    //                 return 0;
    //             }
    //             return prevStayPercent + 0.1
    //         })
    //     }, 500)
    //     return () => clearInterval(interval)
    // }, [selectList, selected]);

    useEffect(() => {
        if (!canvas) {
            return
        }
        // const canvas = canvasRef.current;
        // @ts-ignore
        const context = (canvas as HTMLCanvasElement).getContext('2d');
        console.log(context)
        // setStartTime(new Date().getTime());
        const startTime = new Date().getTime()
        isSelectedChanged.current = false
        // setTimeout(() => {
        //     setSelected(selectList[(index.current + 1) % selectList.length])
        // }, 5000)

        const drawProgress = () => {

            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            const progress = elapsedTime / 5000;
            setStayPercent(progress)

            // 清除画布
            // @ts-ignore
            context.clearRect(0, 0, canvas.width, canvas.height);

            // 绘制背景
            // @ts-ignore
            context.fillStyle = '#ddd';
            // @ts-ignore
            context.fillRect(0, 0, 36, 4);

            // 绘制进度条
            // @ts-ignore
            context.fillStyle = PRIMARY_COLOR;
            // @ts-ignore
            context.fillRect(0, 0, 36 * progress, 4);

            if (progress < 1) {
                requestAnimationFrame(drawProgress);
            }
            else {
                console.log(selected, startTime, currentTime, elapsedTime, isSelectedChanged.current)
                // setSelected(selectList[(index.current + 1) % selectList.length])
                // if (!isSelectedChanged.current) {
                //     setSelected(prevState => selectList[(prevState.index + 1) % 2])
                //     isSelectedChanged.current = true
                // }
                // setSelected(prevState => selectList[(prevState.index + 1) % selectList.length])
                // isSelectedChanged.current = true
            }
        };

        drawProgress();

        // // 清理函数
        // return () => {
        //     if (startTime) {
        //         setStartTime(null);
        //     }
        // };
    }, [canvas, selectList, selected]);

    useEffect(() => {
        // console.log(stayPercent)
        if (stayPercent > 1 && !isSelectedChanged.current) {
            setSelected(prevState => selectList[(prevState.index + 1) % selectList.length])
            isSelectedChanged.current = true
        }
    }, [selectList, stayPercent]);

    return (
        <div
            className="flex flex-row items-center p-10 pl-20 pr-20 w-full h-[750px]"
            style={{
                backgroundImage: `url(https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/background/careers_background_compressed.png)`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat'
            }}
        >
            <div
                className="flex flex-col"
            >
                <div className="text-4xl font-bold mb-2">
                    {selected.title}
                </div>
                {selected.button}
                <div
                    className="flex flex-row mt-10"
                >
                    {selectList.map(item => (
                        <div
                            className="flex flex-col cursor-pointer"
                            key={item.key}
                            onMouseEnter={() => {
                                setSelected(selectList[item.index])
                            }}
                            onClick={() => {
                                scrollTo(item.key)
                            }}
                        >
                            <div className="h-1 w-[36px] bg-gray-200 overflow-hidden">
                                {/*<div*/}
                                {/*    className="bg-primary h-full"*/}
                                {/*    style={{*/}
                                {/*        width: `${selected.index === item.index ? stayPercent*100 : 0}%`,*/}
                                {/*    }}*/}
                                {/*/>*/}
                                {selected.index !== item.index ? <></> :
                                    <canvas
                                        width={36}
                                        height={4}
                                        ref={canvasRef}
                                    />
                                }
                            </div>
                            <div
                                className={`mr-5 text-sm ${item.index === selected.index ? "" : "text-gray-400"}`}
                            >
                                {item.title}
                            </div>

                        </div>
                    ))}
                </div>
            </div>
            <div className="w-[60%] h-[450px]">
                {/*<MarkDownEditor*/}
                {/*    onInput={(value) => {*/}
                {/*    }}*/}
                {/*    onBlur={(value: string) => {*/}
                {/*    }}*/}
                {/*    onUpload={(files) => {*/}
                {/*        return null*/}
                {/*    }}*/}
                {/*    content={"# Hello World"}*/}
                {/*/>*/}
            </div>
        </div>
    )
}
