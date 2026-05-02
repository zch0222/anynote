'use client'

import {useRouter} from "next/navigation";
import BackButton from "@/components/BackButton";

export default function Title({ text }: {
    text: string
}) {
    const router = useRouter()

    return (
        <div className="flex items-center flex-row text-2xl mb-5">
            <BackButton size={30} onClick={() => router.back()}/>
            <div className="ml-1 font-bold">{text}</div>
        </div>
    )
}