'use client'
import Vditor from "vditor";

import {MutableRefObject, useEffect, useState} from "react";

import "vditor/dist/index.css"

export default function MarkDownEditor({onInput, onBlur, onUpload, content, vditorRef}: {
    onInput: (value: string) => void,
    onBlur: (value: string) => void,
    onUpload: (files: File[]) => any,
    content: string,
    vditorRef: MutableRefObject<Vditor | undefined>
}) {

    const [vd, setVd] = useState<Vditor>()

    useEffect(() => {
        const vditor = new Vditor("vditor", {
            mode: "ir",
            height: "100%",
            after:()=> {
                console.log(-2)
                vditor.setValue(content)
                // vditor.focus()
                setVd(vditor)
                vditorRef.current = vditor
            },
            cache: {
                enable: false
            },
            input: onInput,
            upload: {
                handler: onUpload
            },
            blur: onBlur,
            preview: {
              hljs: {
                  style: 'api',
                  lineNumber: true
              }
            },
            counter: {
                enable: true,
                type: "text"
            },
            cdn: process.env.NEXT_PUBLIC_VDITOR_CDN,
            toolbar: [
                "emoji",
                "headings",
                "bold",
                "italic",
                "strike",
                "link",
                "|",
                "list",
                "ordered-list",
                "check",
                "outdent",
                "indent",
                "|",
                "quote",
                "line",
                "code",
                "inline-code",
                "insert-before",
                "insert-after",
                "|",
                "upload",
                "table",
                "|",
                "undo",
                "redo",
                "|",
                "fullscreen",
                "edit-mode",
                {
                    name: "more",
                    toolbar: [
                        "both",
                        "code-theme",
                        "content-theme",
                        "export",
                        "outline",
                    ],
                }
            ]
        })
    }, [])

    return <div id="vditor" className="vditor" />;
}
