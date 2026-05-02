'use client'

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkMath from "remark-math";
import 'github-markdown-css/github-markdown-light.css'

import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";

function MarkDownViewer({ content, maxWidth }: {
    content: string
    maxWidth: number
}) {
    const processThinkTags = (text: string) => {
        let result = '';
        let isInThinkBlock = false;
        
        text.split('\n').forEach((line: string) => {
            if (line.includes('<think>')) {
                isInThinkBlock = true;
                // 处理think标签后的内容
                const content = line.replace('<think>', '');
                if (content.trim()) {
                    result += `> ${content}\n`;
                }
            } else if (line.includes('</think>')) {
                isInThinkBlock = false;
                // 处理think标签前的内容
                const content = line.replace('</think>', '');
                if (content.trim()) {
                    result += `> ${content}\n`;
                }
            } else if (isInThinkBlock) {
                result += `> ${line}\n`;
            } else {
                result += line + '\n';
            }
        });
        
        return result;
    };

    return (
        <div className={`w-full h-full ${maxWidth ? 'max-w-[' + maxWidth + 'px]' : ''}`}>
            <ReactMarkdown
                className={'markdown-body bg-white w-full'}
                components={{
                    // @ts-ignore
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                            <SyntaxHighlighter
                                // @ts-ignore
                                style={vscDarkPlus}
                                language={match[1].toLowerCase()}
                                PreTag="div"
                                {...props}
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        ) : (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    },
                }}
                remarkPlugins={[remarkGfm, remarkMath]}
            >
                {content ? processThinkTags(content) : ""}
            </ReactMarkdown>
        </div>
    )
}

export default withThemeConfigProvider(MarkDownViewer)