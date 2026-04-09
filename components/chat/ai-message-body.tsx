'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { SpeakButton } from './speak-button'

export function AIMessageBody({
  body,
  isStreaming,
}: {
  body: string
  isStreaming: boolean
}) {
  return (
    <span className="mt-1 text-sm leading-relaxed text-accent inline [&_code]:rounded [&_code]:bg-hover [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-white [&_pre]:mt-2 [&_pre]:rounded-lg [&_pre]:bg-bg-lifted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-white [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc [&_li]:my-0.5 [&_a]:text-white [&_a]:underline [&_p]:inline">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {body}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent blink-caret ml-0.5"
          aria-hidden
        />
      )}
      {!isStreaming && body && <SpeakButton text={body} />}
    </span>
  )
}
