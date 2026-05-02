'use client'
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Drawer, message} from "antd";

import {getNoteById, updateNote, uploadNoteImage} from "@/requests/client/note/note";
import {useSearchParams} from 'next/navigation'


import NoteHead from "@/components/note/NoteHead";
import Loading from "@/components/Loading";
import MarkDownEditor from "@/components/MarkDownEditor";
// import MuyaMarkDownEditor from "@/components/MuyaMarkDownEditor";
import MarkDownViewer from "@/components/MarkDownViewer";
import DrawerContent from "@/components/note/DrawerContent";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import {useDispatch} from "react-redux";
import {showMessage} from "@/store/message/messageSlice";
import {getDateString} from "@/utils/date";
import Vditor from "vditor";
import {nanoid} from "nanoid";
import {Note} from "@/types/noteTypes";
import debounce from "@/utils/debounce";
import MilkdownEditorWrapperNew from "@/components/MilkdownEditorNew";

const EditorType = {
    "MUYA": "muya",
    "VDITOR": "vditor",
    "MILKDOWN": "milkdown"
}

function Note({params}: {
    params: {
        id: number
    }
}) {
    const {id} = params

    const dispatch = useDispatch()
    const [openDrawer, setOpenDrawer] = useState<boolean>(false)
    const [data, setData] = useState<Note | undefined>(undefined)
    const [isUpdatingNote, setIsUpdatingNote] = useState(false)
    const [latestUpdateTime, setLatestUpdateTime] = useState<Date>()
    const [title, setTitle] = useState<string>("")
    const vditorRef = useRef<Vditor>()
    // const [editorType, setEditorType] = useState<number>(EditorType.MUYA);
    const searchParams = useSearchParams()
    const editorType = searchParams.get("editorType") || EditorType.MILKDOWN

    useEffect(() => {
        getNoteById({
            id: id
        }).then(res => {
            const note = res.data.data
            setData(note)
            setTitle(note.title)
            setLatestUpdateTime(new Date(note.updateTime))
        }).catch(
            e => console.log(e)
        )
        return () => {
            // const value = vditorRef.current?.getValue()
            // if (value) {
            //     fetchUpdateNote(value)
            // }
        }
    }, [])

    useEffect(() => {
    }, [vditorRef.current])

    const fetchUpdateNote = useCallback(debounce((value: string) => {
        const match = value.match(/^# (.*)$/m);
        console.log(match)
        setIsUpdatingNote(true)
        if (EditorType.VDITOR == editorType) {
            value = value.replace(/\n+/g, '\n\n')
        }
        updateNote({
            id: id,
            title: match?.[1],
            content: value
        }).then(
            res => {
                setLatestUpdateTime(new Date())
                if (match) {
                    setTitle(match[1])
                }
                message.success("保存成功", 1)
            }
        ).catch(
            e => console.log(e)
        ).finally(
            () => {
                console.log("finish....")
                setIsUpdatingNote(false)
            }
        )
    }, 500, false), [id])

    const onUpload = (files: File[]) => {

        const file = files[0]
        if (file.type.startsWith('image/')) {
            dispatch(showMessage({
                key: `note_${id}_uploading`,
                type: "loading",
                content: "上传中",
                duration: 0,
            }))
            return uploadNoteImage({
                noteId: id,
                uploadId: nanoid(),
                image: file
            }).then(
                res => {
                    console.log(res.data.data.image)
                    if (vditorRef) {
                        vditorRef.current?.insertValue(res.data.data.image, true)
                    }
                    if (res.data.data.image) {
                        const regex = /\]\((.*?)\)/;
                        const match = res.data.data.image.match(regex);
                        if (match && match[1]) {
                            console.log("Extracted URL:", match[1]);
                            return match[1]
                        }
                    }
                    return res.data.data.image
                }
            ).catch(
                e => console.log(e)
            ).finally(() => {
                dispatch(showMessage({
                    isDestroy: true,
                    key: `note_${id}_uploading`,
                    content: null
                }))
            })
        }
        return null
    }

    const getEditor = useMemo(() => {
        if (!data) {
            return <></>
        }
        if (EditorType.MUYA == editorType) {
            return (
                // <MuyaMarkDownEditor
                //     onInput={fetchUpdateNote}
                //     onBlur={() => {}}
                //     content={data.content}
                // />
                <></>
            )
        } else if (EditorType.MILKDOWN === editorType) {
            return (
                // <MilkdownEditorWrapper
                //     onInput={fetchUpdateNote}
                //     onBlur={() => {}}
                //     content={data.content}
                //     onUpload={onUpload}
                // />
                <MilkdownEditorWrapperNew
                    onInput={fetchUpdateNote}
                    onBlur={() => {
                    }}
                    content={data.content}
                    onUpload={onUpload}
                />
            )
        }
        return (
            <MarkDownEditor
                onInput={fetchUpdateNote}
                onBlur={() => {
                }}
                onUpload={onUpload}
                content={data.content}
                vditorRef={vditorRef}
            />
        )
    }, [data, editorType, fetchUpdateNote, onUpload])

    if (!data) {
        return (
            <div className="flex w-full h-full">
                <Loading/>
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full h-full">
            <div className="w-full h-[60px]">
                <NoteHead
                    editorType={parseInt(editorType)}
                    // setEditorType={setEditorType}
                    title={title}
                    updateTime={isUpdatingNote ? '正在更新...' : `最近更新：${getDateString(latestUpdateTime)}`}
                    onShowDrawer={() => {
                        vditorRef.current?.focus()
                        setOpenDrawer(!openDrawer)
                    }}
                />
            </div>
            <div className="flex flex-col items-center relative flex-grow w-full overflow-x-hidden overflow-y-auto">
                {data.notePermissions < 6 ?
                    <MarkDownViewer
                        content={data.content}
                    /> :
                    <div className="w-full h-full">
                        {getEditor}
                        {/*{EditorType.MUYA == editorType ?*/}
                        {/*    <MuyaMarkDownEditor*/}
                        {/*        onInput={fetchUpdateNote}*/}
                        {/*        onBlur={() => {}}*/}
                        {/*        content={data.content}*/}
                        {/*    /> :*/}
                        {/*    <MarkDownEditor*/}
                        {/*        onInput={fetchUpdateNote}*/}
                        {/*        onBlur={() => {}}*/}
                        {/*        onUpload={onUpload}*/}
                        {/*        content={data.content}*/}
                        {/*        vditorRef={vditorRef}*/}
                        {/*    />*/}
                        {/*}*/}

                        {/*<MarkDownEditor*/}
                        {/*    onInput={fetchUpdateNote}*/}
                        {/*    onBlur={() => {}}*/}
                        {/*    onUpload={onUpload}*/}
                        {/*    content={data.content}*/}
                        {/*    vditorRef={vditorRef}*/}
                        {/*/>*/}
                    </div>
                }
                <Drawer
                    closeIcon={null}
                    mask={false}
                    open={openDrawer}
                    onClose={() => setOpenDrawer(false)}
                    getContainer={false}
                >
                    <DrawerContent
                        id={id}
                        knowledgeBaseId={data.knowledgeBaseId}
                        permissions={data.notePermissions}
                    />
                </Drawer>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Note)
