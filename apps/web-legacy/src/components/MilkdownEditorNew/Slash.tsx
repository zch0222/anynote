import {Editor, editorViewCtx} from "@milkdown/core"
import { Ctx } from "@milkdown/ctx"
import { slashFactory, SlashProvider } from "@milkdown/plugin-slash"
import { createCodeBlockCommand } from "@milkdown/preset-commonmark"
import { useInstance } from '@milkdown/react'
import { callCommand } from "@milkdown/utils"
import { usePluginViewContext } from "@prosemirror-adapter/react"
import React, { useCallback, useEffect, useRef } from "react"
// import {handleSendMessage, sendChatMessage} from "@/components/ChatCompletions";
import {modelOptions} from "@/constants/model";

export const slash = slashFactory('Commands');

export const SlashView = () => {
    const ref = useRef<HTMLDivElement>(null)
    const slashProvider = useRef<SlashProvider>()

    const { view, prevState } = usePluginViewContext()
    const [loading, get] = useInstance()
    const action = useCallback((fn: (ctx: Ctx) => void) => {
        if (loading) return;
        get().action(fn)
    }, [loading])

    useEffect(() => {
        const div = ref.current
        if (loading || !div) {
            return;
        }
        slashProvider.current = new SlashProvider({
            content: div,
        })

        return () => {
            slashProvider.current?.destroy()
        }
    }, [loading])

    useEffect(() => {
        slashProvider.current?.update(view, prevState)
    })

    const command = (e: React.KeyboardEvent | React.MouseEvent) => {
        e.preventDefault()
        action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            const { selection } = state;
            const { from } = selection;

            // 获取当前光标位置之前的内容作为提示词
            const textBeforeCursor = state.doc.textBetween(0, from);
            const prompt = `请根据以下文本内容，在光标位置补充合适的内容。当前行内容：${textBeforeCursor}。请只返回需要补充的内容，不要包含任何解释以及原文本。`;

            // 先删除斜杠字符
            const tr = state.tr.deleteRange(from - 1, from);
            view.dispatch(tr);
            view.focus();

            // // 调用自动补全
            // handleSendMessage(prompt).then(completion => {
            //     if (completion) {
            //         // 使用新的状态创建插入事务
            //         const newTr = view.state.tr.insertText(completion);
            //         view.dispatch(newTr);
            //     }
            // });

            return true;
        })
    }

    // const handleSendMessage = async (prompt: string) => {
    //     try {
    //         const messages = await sendChatMessage({
    //             model: modelOptions[1].value,
    //             prompt: prompt,
    //             conversationId: null
    //         });
    //
    //         console.log('收到的消息:', messages);
    //         return messages;
    //     } catch (error) {
    //         console.error('发送消息失败:', error);
    //         return '';
    //     }
    // };

    const handleCompletion = async (editor: Editor) => {
        const view = (editor as any).view;
        if (!view) return;

        const {state} = view;
        const {selection} = state;
        const {from} = selection;

        // 获取当前行的内容
        const $pos = state.doc.resolve(from);
        const lineStart = $pos.start();
        const lineEnd = $pos.end();
        const currentLine = state.doc.textBetween(lineStart, lineEnd);

        // 构建提示词
        const prompt = `请根据以下文本内容，在最后一个/位置补充合适的内容。当前内容：${currentLine}。请只返回需要补充的内容，不要包含任何解释。`;

        // // 获取补全内容
        // const completion = await handleSendMessage(prompt);

        // if (completion) {
        //     // 插入补全内容
        //     view.dispatch(view.state.tr.insertText(completion, from));
        // }
    };

    return (
        <div ref={ref} aria-expanded="false" className="absolute data-[show='false']:hidden">
            <button
                className="text-gray-600 bg-slate-200 px-2 py-1 rounded-lg hover:bg-slate-300 border hover:text-gray-900"
                onKeyDown={(e) => command(e)}
                onMouseDown={(e) => { command(e)}}
            >
                自动补全
            </button>
        </div>
    )
}
