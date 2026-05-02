'use client'
import { BlockProvider } from "@milkdown/plugin-block"
import { useInstance } from '@milkdown/react'
import { useEffect, useRef, useState } from "react"
import {
    turnIntoTextCommand,
    wrapInHeadingCommand,
} from "@milkdown/preset-commonmark";
import { commandsCtx } from "@milkdown/core";
import { Button, Popover, Menu } from 'antd';
import type { MenuProps } from 'antd';

type MenuItem = Required<MenuProps>['items'][number];



export const BlockView = () => {
    const ref = useRef<HTMLDivElement>(null)
    const tooltipProvider = useRef<BlockProvider>()

    const [loading, get] = useInstance()
    const [showMenu, setShowMenu] = useState(false)

    useEffect(() => {
        const div = ref.current
        if (loading || !div) return;

        const editor = get();
        if (!editor) return;

        tooltipProvider.current = new BlockProvider({
            ctx: editor.ctx,
            content: div,
        })
        tooltipProvider.current?.update()

        return () => {
            tooltipProvider.current?.destroy()
        }
    }, [loading])
    const items: MenuItem[] = [
        {
            key: 'heading_1',
            icon: <></>,
            label: (
                <div
                    onClick={() => {
                        if (loading) return;

                        const commands = get().ctx.get(commandsCtx);
                        commands.call(wrapInHeadingCommand.key, 1);
                        setShowMenu(false)
                    }}
                >
                    Heading 1
                </div>
            ),
        },
        {
            key: 'heading_2',
            icon: <></>,
            label: (
                <div
                    onClick={() => {
                        if (loading) return;

                        const commands = get().ctx.get(commandsCtx);
                        commands.call(wrapInHeadingCommand.key, 2);
                        setShowMenu(false)
                    }}
                >
                    Heading 2
                </div>
            ),
        },
        {
            key: 'heading_3',
            icon: <></>,
            label: (
                <div
                    onClick={() => {
                        if (loading) return;

                        const commands = get().ctx.get(commandsCtx);
                        commands.call(wrapInHeadingCommand.key, 3);
                        setShowMenu(false)
                    }}
                >
                    Heading 3
                </div>
            ),
        },
        {
            key: 'text',
            icon: <></>,
            label: (
                <div
                    onClick={() => {
                        if (loading) return;

                        const commands = get().ctx.get(commandsCtx);
                        commands.call(turnIntoTextCommand.key);
                        setShowMenu(false)
                    }}
                >
                    Text
                </div>
            ),
        },
    ]


    const popoverContent = (
        <div
            className="absolute top-full mt-2 w-60 cursor-pointer rounded border-2 bg-gray-50 shadow dark:border-gray-900 dark:bg-gray-900">
            <div
                onClick={() => {
                    if (loading) return;


                    const commands = get().ctx.get(commandsCtx);
                    commands.call(wrapInHeadingCommand.key, 1);

                }}
                className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
                Heading 1
            </div>
            <div
                onClick={() => {
                    if (loading) return;

                    const commands = get().ctx.get(commandsCtx);
                    commands.call(wrapInHeadingCommand.key, 2);
                }}
                className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
                Heading 2
            </div>
            <div
                onClick={() => {
                    if (loading) return;

                    const commands = get().ctx.get(commandsCtx);
                    commands.call(wrapInHeadingCommand.key, 3);
                }}
                className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
                Heading 3
            </div>
            <div
                onClick={() => {
                    if (loading) return;

                    const commands = get().ctx.get(commandsCtx);
                    commands.call(turnIntoTextCommand.key);
                }}
                className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
                Text
            </div>
        </div>
    )

    return (
        <div ref={ref} className="absolute w-6 bg-slate-200 rounded hover:bg-slate-300 cursor-grab">
            <div onClick={() => setShowMenu(!showMenu)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
                     stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round"
                          d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"/>
                </svg>
            </div>
            {showMenu && (
                <Menu selectedKeys={[]} style={{width: 256}} mode="vertical" items={items}/>
            )}
        </div>
    )
}
