export default function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let latestArgs: Parameters<T> | null = null; // 用于存储最新的参数


    return function(this: ThisParameterType<T>, ...args: Parameters<T>): void {
        const context = this;
        latestArgs = args

        if (timeout !== null) {
            clearTimeout(timeout);
        }

        if (immediate) {
            const callNow = !timeout;
            timeout = setTimeout(() => {
                timeout = null;
            }, wait);
            if (callNow) {
                func.apply(context, latestArgs || []);
            }
        } else {
            timeout = setTimeout(() => {
                func.apply(context, latestArgs || []);
            }, wait);
        }
    };
}