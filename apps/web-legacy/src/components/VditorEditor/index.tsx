"use client"

import {MutableRefObject, useEffect, useState} from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";

const VditorEditor = ({onInput, onBlur, onUpload, content, vditorRef}: {
    onInput?: (value: string) => void,
    onBlur?: (value: string) => void,
    onUpload?: (files: File[]) => string | Promise<string> | Promise<null> | null,
    content?: string,
    vditorRef: MutableRefObject<Vditor | undefined>
}) => {
    const [vd, setVd] = useState<Vditor>();
    useEffect(() => {
        const vditor = new Vditor("vditor", {
            mode: "ir",
            height: "100%",
            width: "100%",
            after: () => {
                vditor.setValue(content || "");
                setVd(vditor);
                vditorRef.current = vditor
            },
            input: onInput,
            blur: onBlur,
            toolbar: ['headings', 'bold','line', 'list', 'code']
        });
        // Clear the effect
        return () => {
            vd?.destroy();
            setVd(undefined);
        };
    }, []);
    return <div id="vditor" className="vditor" />;
};

export default VditorEditor;
