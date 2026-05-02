import { RefObject } from "react";

export function scrollToBottoms(ref: any) {
    if (ref) {
        ref.scrollTo({ top: ref.scrollHeight, behavior: 'smooth' });
    }
}

export function scrollTo(id: string) {
    const anchorElement = document.getElementById(id); //找到滚动到的元素
    if(anchorElement){
        anchorElement.scrollIntoView({behavior:'smooth',block:'start'}); // 让页面滚动到元素所在位置
    }
}