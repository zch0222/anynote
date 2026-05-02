'use client'
import {Muya} from "@muyajs/core";
import {MutableRefObject, useEffect, useState} from "react";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

import '@muyajs/core/lib/style.css';
import Vditor from "vditor";
import requestAnimationFrame from "zrender/lib/animation/requestAnimationFrame";
import { useRef } from "react";

function MuyaMarkDownEditor({onInput, content}: {
    onInput: (value: string) => void,
    // onBlur: (value: string) => void,
    // onUpload: (files: File[]) => string | Promise<string> | Promise<null> | null,
    content: string,
    // vditorRef: MutableRefObject<Vditor | undefined>
}) {

    // const [muya, setMaya] = useState()
    const editorRef = useRef(null);


    useEffect(() => {

        // @ts-ignore
        const muya = new Muya(editorRef.current)
        muya.init()
        muya.setContent(content)

        // })
        muya.domNode.addEventListener("input", (e) => {
            // console.log(e.target.innerText)
            // onInput(e.target.innerText)
            // onInput(muya.getMarkdown())
            // console.log(muya.getState())
            requestAnimationFrame(() => {
                console.log(muya.getMarkdown())
                onInput(muya.getMarkdown())
            })
        })
        //
        muya.domNode.addEventListener("keydown", (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                // onInput(e.target.innerText);
                requestAnimationFrame(() => {
                    onInput(muya.getMarkdown())
                })
            }
        });
        muya.domNode.addEventListener('blur', (e) => {
            onInput(muya.getMarkdown())
        })

        muya.domNode.addEventListener("focus", (e) => {
            onInput(muya.getMarkdown())
        })
        //
        muya.domNode.addEventListener('paste', (e) => {
            // onInput(e.target.innerText)
            requestAnimationFrame(() => {
                onInput(muya.getMarkdown())
            })
        })

        muya.domNode.addEventListener('cut', (e) => {
            // onInput(e.target.innerText)
            requestAnimationFrame(() => {
                onInput(muya.getMarkdown())
            })
        })

        const onKeydown = (event: KeyboardEvent) => {
            // 检查是否同时按下了Ctrl键和S键
            if (event.ctrlKey && event.key === 's') {
                // 阻止默认行为，例如浏览器的保存页面操作
                event.preventDefault();

                // 在这里执行你想要的操作
                console.log('Ctrl + S 被按下了');
                console.log(muya.getMarkdown())
                onInput(muya.getMarkdown())

                // 例如，你可以调用一个函数来保存数据
                // saveData();
            }
            else if (event.ctrlKey && event.key === 'z') {
                event.preventDefault();
                muya.editor.history.undo()
                requestAnimationFrame(() => {
                    onInput(muya.getMarkdown())
                })
            }
        }

        muya.domNode.addEventListener('keydown', onKeydown)
        return () => {
            // if (muya && muya.getMarkdown()) {
            //     requestAnimationFrame(() => {
            //         onInput(muya.getMarkdown())
            //     })
            // }

        }





    }, []);

    return (
        <div
            id="muyaEditor"
            className="w-full h-full overflow-y-auto"
            ref={editorRef}
        >

        </div>
    )
}

export default withThemeConfigProvider(MuyaMarkDownEditor)