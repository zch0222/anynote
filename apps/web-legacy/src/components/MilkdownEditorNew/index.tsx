import {defaultValueCtx, Editor, rootCtx} from '@milkdown/core';
import {FC, useEffect, useState} from 'react';

import {commonmark} from '@milkdown/preset-commonmark';
import {Milkdown, MilkdownProvider, useEditor} from '@milkdown/react';
import {nord} from '@milkdown/theme-nord';
import {ProsemirrorAdapterProvider, useNodeViewFactory, usePluginViewFactory} from '@prosemirror-adapter/react';

import {slash, SlashView} from './Slash';

import '@milkdown/theme-nord/style.css';
import {upload, uploadConfig, Uploader} from "@milkdown/plugin-upload";
import {Fragment, Node as ProseMirrorNode, Schema} from "prosemirror-model";
import {gfm} from "@milkdown/preset-gfm";
import {history} from "@milkdown/plugin-history";
import {clipboard} from "@milkdown/plugin-clipboard";
import {cursor} from "@milkdown/plugin-cursor";
import {math} from "@milkdown/plugin-math";
import {block} from "@milkdown/plugin-block";
import {diagram} from "@milkdown/plugin-diagram";
import {prism} from "@milkdown/plugin-prism";
import {tooltip, TooltipView} from "@/components/MilkdownEditor/Tooltip";
import {listener, listenerCtx} from "@milkdown/plugin-listener";
import "./index.css"
import {BlockView} from "@/components/MilkdownEditor/Block";


export const MilkdownEditorNew = ({onInput, onBlur, onUpload, content, vditorRef, onKeyDown}: {
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
    }, [])

    return <Milkdown/>
}

export default function MilkdownEditorWrapperNew({onInput, onBlur, onUpload, content, vditorRef}: {
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
                    {
                        isClient &&
                        <MilkdownEditorNew
                            onInput={onInput}
                            onBlur={() => {}}
                            content={content}
                            onUpload={onUpload}
                        />
                    }
                </div>
            </ProsemirrorAdapterProvider>
        </MilkdownProvider>
    )
}
