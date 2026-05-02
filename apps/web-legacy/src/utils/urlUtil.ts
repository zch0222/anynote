

export function removeAllUrlParameter(url: string) {
    const urlObj = new URL(url);
    urlObj.search = '';
    return urlObj.toString();
}
