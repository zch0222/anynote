'use client'
import { useTheme } from "next-themes";

export default function Catalogue(props: {
    width: number,
    height: number
}) {

    const {theme} = useTheme()

    return (
        <svg
            style={{
                color: 'var(--color-text)'
            }}
            className="icon"
            viewBox="0 0 1024 1024"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            p-id="4055"
            width={props.width}
            height={props.height}
        >
            <path fill={theme === 'dark' ? 'white' : 'black'} d="M64.837536 767.45166l894.088208 0 0 127.727801L64.837536 895.17946 64.837536 767.45166zM64.837536 448.134757l894.088208 0 0 127.727801L64.837536 575.862557 64.837536 448.134757zM256.428038 128.817853l702.497707 0 0 127.725202-702.497707 0L256.428038 128.817853zM64.837536 128.817853l127.726401 0 0 127.725202L64.837536 256.543056 64.837536 128.817853z"  p-id="4179"></path>
        </svg>
    )
}
