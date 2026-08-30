import DOMPurify from "dompurify";
import { marked } from "marked";

export interface MarkdownProps {
  content: string;
  className?: string;
}

/** Markdown 渲染（marked + DOMPurify 消毒，防插件/远端内容注入） */
export function Markdown(props: MarkdownProps): React.ReactElement {
  const html = DOMPurify.sanitize(marked.parse(props.content, { async: false }));
  return (
    <div
      className={"prose-sm max-w-none [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 " + (props.className ?? "")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
