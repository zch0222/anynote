'use client'
import { useTheme } from "next-themes";

export default function NoteIcon(props: {
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
            <path d="M224 831.936V192.096L223.808 192H576v159.936c0 35.328 28.736 64.064 64.064 64.064h159.712c0.032 0.512 0.224 1.184 0.224 1.664L800.256 832 224 831.936zM757.664 352L640 351.936V224.128L757.664 352z m76.064-11.872l-163.872-178.08C651.712 142.336 619.264 128 592.672 128H223.808A64.032 64.032 0 0 0 160 192.096v639.84A64 64 0 0 0 223.744 896h576.512A64 64 0 0 0 864 831.872V417.664c0-25.856-12.736-58.464-30.272-77.536z" fill={theme === 'dark' ? 'white' : 'black'} p-id="4307"></path><path d="M640 512h-256a32 32 0 0 0 0 64h256a32 32 0 0 0 0-64M640 672h-256a32 32 0 0 0 0 64h256a32 32 0 0 0 0-64" fill={theme === 'dark' ? 'white' : 'black'} p-id="4308"></path>
        </svg>
    )

}

