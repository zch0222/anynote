import { MobileNoteBases } from "@/features/notes/components/mobile/note-bases-mobile";

export default function Page() {
  // 与 /m/notes 同一个列表，只是跳去只读阅读，且不提供新建
  return <MobileNoteBases basePath="/m/wikis" title="知识库" showCreate={false} />;
}
