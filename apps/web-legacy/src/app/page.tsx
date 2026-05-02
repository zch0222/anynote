import { Image } from "@nextui-org/react";
import HomeHead from "@/components/home/HomeHead";
import HomeFooter from "@/components/home/HomeFooter";
import DocQuery from "@/components/home/DocQuery";
import HomeTop from "../components/home/HomeTop"
import EditorDemo from "@/components/home/EditorDemo";
import AIWorkflow from "../components/AIWorkflow";
import ChartsDemo from "@/components/home/ChartsDemo";
import AIWorkflowDemo from "../components/home/AIWorkflowDemo";

export default function Home() {
  return (
      <div
          className="w-full h-full flex flex-col overflow-y-auto pb-5"
      >
        <HomeHead/>
        <div className="w-full flex flex-col items-center">
            <HomeTop/>
            <DocQuery/>
            <EditorDemo/>
            <AIWorkflowDemo/>
        </div>
        {/*<div className="w-full flex flex-col items-center">*/}
          {/*<Image*/}
          {/*    className="h-[800px]"*/}
          {/*    src="https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/background/careers_background_compressed.png"*/}
          {/*    alt="careers"*/}
          {/*/>*/}


        {/*</div>*/}
        <HomeFooter/>
      </div>
  )
}
