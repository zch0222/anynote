'use client'
import {useState, useRef, useEffect} from "react";
import { Drawer } from "antd";

import { getNoteById } from "@/requests/client/note/note";

import NoteHead from "@/components/note/NoteHead";
import Loading from "@/components/Loading";
import MarkDownEditor from "@/components/MarkDownEditor";
import DrawerContent from "@/components/note/DrawerContent";

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import { updateNote, uploadNoteImage } from "@/requests/client/note/note";
import { getDateString } from "@/utils/date";
import Vditor from "vditor";
import {nanoid} from "nanoid";
import {Note} from "@/types/noteTypes";

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
            const value = vditorRef.current?.getValue()
            if (value) {
                fetchUpdateNote(value)
            }
        }
    }, [])

    useEffect(() => {
    }, [vditorRef.current])

    const fetchUpdateNote = (value: string) => {
        const match = value.match(/^# (.*)$/m);
        console.log(match)
        setIsUpdatingNote(true)
        value = value.replace(/\n+/g, '\n\n')
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
            }
        ).catch(
            e => console.log(e)
        ).finally(
            () => {
                console.log("finish....")
                setIsUpdatingNote(false)
            }
        )
    }

    const onUpload = (files: File[]) => {

        const file = files[0]
        if (file.type.startsWith('image/')) {
            console.log(files)
            uploadNoteImage({
                noteId: id,
                uploadId: nanoid(),
                image: file
            }).then(
                res => {
                    console.log(res.data.data.image)
                    if (vditorRef) {
                        vditorRef.current?.insertValue(res.data.data.image, true)
                    }
                }
            ).catch(
                e => console.log(e)
            )
        }
        return null
    }

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
                    title={title}
                    updateTime={isUpdatingNote ? '正在更新...' : `最近更新：${getDateString(latestUpdateTime)}`}
                    onShowDrawer={() => {
                        vditorRef.current?.focus()
                        setOpenDrawer(!openDrawer)
                    }}
                />
            </div>
            <div className="relative flex-grow w-full overflow-x-hidden overflow-y-auto">
                <MarkDownEditor
                    onInput={fetchUpdateNote}
                    onBlur={fetchUpdateNote}
                    onUpload={onUpload}
                    content={data.content}
                    vditorRef={vditorRef}
                />
                <Drawer
                    closeIcon={null}
                    mask={false}
                    open={openDrawer}
                    onClose={() => setOpenDrawer(false)}
                    getContainer={false}
                >
                    <DrawerContent
                        id={id}
                    />

                </Drawer>
            </div>
        </div>
    )
}

export default withThemeConfigProvider(Note)
