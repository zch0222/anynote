'use client'

import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core';

import { Milkdown, useEditor, MilkdownProvider } from '@milkdown/react'
import { commonmark, blockquoteKeymap } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord'
import {useEffect, useState} from "react";
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { math } from '@milkdown/plugin-math';
import { usePluginViewFactory } from '@prosemirror-adapter/react';
import { block } from '@milkdown/plugin-block';
import '@milkdown/theme-nord/style.css';
import { tooltip, TooltipView } from './Tooltip';
import 'katex/dist/katex.min.css';
import { diagram } from '@milkdown/plugin-diagram';
import { BlockView } from './Block';
import "./prism-nord.css"
import { prism } from '@milkdown/plugin-prism';
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/react'
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { $view } from "@milkdown/utils";
import {upload, uploadConfig, Uploader} from '@milkdown/plugin-upload';
import { slash, SlashView } from './Slash';
import { Node as ProseMirrorNode, Fragment } from 'prosemirror-model';
import { Schema } from 'prosemirror-model';

import {
    codeBlockSchema,
} from "@milkdown/preset-commonmark";

import {CodeBlock} from "@/components/MilkdownEditor/CodeBlock";
import "./index.css"

export const MilkdownEditor = ({onInput, onBlur, onUpload, content, vditorRef, onKeyDown}: {
    onInput: (value: string) => void,
    onBlur?: (value: string) => void,
    onUpload?: (files: File[]) => string | Promise<string | void> | Promise<null> | null,
    content: string,
    vditorRef?: any,
    onKeyDown?: (editor: Editor) => void
}) => {
    const pluginViewFactory = usePluginViewFactory();
    const nodeViewFactory = useNodeViewFactory();

    const uploader: Uploader = async (files: FileList, schema: Schema): Promise<Fragment | ProseMirrorNode | ProseMirrorNode[]> => {
        const images: File[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (!file) {
                continue;
            }

            if (!file.type.includes('image')) {
                continue;
            }

            images.push(file);
        }

        const nodes = await Promise.all(
            images.map(async (image) => {
                if (!onUpload) {
                    return null;
                }
                const src = await onUpload([image]);
                if (!src) return null;
                const alt = image.name;
                return schema.nodes.image.createAndFill({
                    src,
                    alt,
                }) as ProseMirrorNode;
            }),
        );

        return nodes.filter((node): node is ProseMirrorNode => node !== null);
    };

    useEditor((root) => {
        return Editor
            .make()
            .config(ctx => {
                ctx.set(rootCtx, root)
                ctx.set(defaultValueCtx, content)
                ctx.set(tooltip.key, {
                    view: pluginViewFactory({
                        component: TooltipView,
                    })
                })
                ctx.set(block.key, {
                    view: pluginViewFactory({
                        component: BlockView,
                    })
                })
                ctx.set(slash.key, {
                    view: pluginViewFactory({
                        component: SlashView,
                    })
                })

                const listener = ctx.get(listenerCtx);
                listener.markdownUpdated((ctx, markdown, prevMarkdown) => {
                    if (markdown !== prevMarkdown) {
                        console.log(markdown)
                        onInput(markdown)
                    }
                })

                // // 添加键盘事件监听
                // if (onKeyDown) {
                //     const editor = ctx.get(rootCtx);
                //     if (editor) {
                //         const view = (editor as any).view;
                //         if (view) {
                //             view.dom.addEventListener('keydown', (event: KeyboardEvent) => {
                //                 if (event.key === 'Tab') {
                //                     event.preventDefault();
                //                     onKeyDown(editor as unknown as Editor);
                //                 }
                //             });
                //         }
                //     }
                // }

                ctx.update(uploadConfig.key, (prev) => ({
                    ...prev,
                    uploader,
                }));
            })
            .config(nord)
            .use(commonmark)
            .use(gfm)
            .use(history)
            .use(clipboard)
            .use(cursor)
            .use(math)
            .use(block)
            .use(diagram)
            .use(prism)
            .use(tooltip)
            .use(listener)
            .use(upload)
            .use(slash)
            // .use(
            //     $view(codeBlockSchema.node, () =>
            //         nodeViewFactory({ component: CodeBlock })
            //     )
            // )
    }, [])

    return (
        <Milkdown />
    )
}

export default function MilkdownEditorWrapper({onInput, onBlur, onUpload, content, vditorRef}: {
    onInput: (value: string) => void,
    onBlur?: (value: string) => void,
    onUpload?: (files: File[]) => string | Promise<string | void> | Promise<null> | null,
    content: string,
    vditorRef?: any
}) {
    const [isClient, setIsClient] = useState(false);

    // Wait until after client-side hydration to show
    useEffect(() => {
        setIsClient(true);
    }, []);
    return (
        <MilkdownProvider>
            <ProsemirrorAdapterProvider>
                <div className="w-full h-full">
                    {isClient &&
                        <MilkdownEditor
                            onInput={onInput}
                            onBlur={() => {}}
                            content={content}
                            onUpload={onUpload}
                        />}
                </div>
            </ProsemirrorAdapterProvider>
        </MilkdownProvider>
    )
}
